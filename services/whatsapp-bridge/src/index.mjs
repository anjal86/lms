import { createHmac } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const PORT = Number(process.env.PORT || 3100);
const AUTH_ROOT = process.env.AUTH_ROOT || '/data/auth';
const API_KEY = (process.env.WHATSAPP_BRIDGE_API_KEY || '').trim();
const WEBHOOK_SECRET = (process.env.WHATSAPP_BRIDGE_WEBHOOK_SECRET || '').trim();
const CRM_WEBHOOK_URL = (process.env.CRM_WEBHOOK_URL || '').trim();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const waLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' });
const instances = new Map();

if (!API_KEY || !WEBHOOK_SECRET || !CRM_WEBHOOK_URL) {
  throw new Error('WHATSAPP_BRIDGE_API_KEY, WHATSAPP_BRIDGE_WEBHOOK_SECRET and CRM_WEBHOOK_URL are required.');
}

function safeInstanceId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value) ? value : null;
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req, maxBytes = 25 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function authorized(req) {
  return req.headers['x-bridge-api-key'] === API_KEY;
}

function normalizePhoneFromJid(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function targetJid(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) throw new Error('A WhatsApp phone number is required.');
  return `${digits}@s.whatsapp.net`;
}

function unwrapMessage(message) {
  let current = message || {};
  for (let depth = 0; depth < 4; depth += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current;
}

function messageSummary(rawMessage) {
  const message = unwrapMessage(rawMessage);
  if (typeof message.conversation === 'string') return { type: 'text', body: message.conversation };
  if (typeof message.extendedTextMessage?.text === 'string') return { type: 'text', body: message.extendedTextMessage.text };
  if (message.imageMessage) return {
    type: 'image',
    body: message.imageMessage.caption || '[Photo]',
    mimeType: message.imageMessage.mimetype || 'image/jpeg',
  };
  if (message.videoMessage) return {
    type: 'video',
    body: message.videoMessage.caption || '[Video]',
    mimeType: message.videoMessage.mimetype || 'video/mp4',
  };
  if (message.audioMessage) return {
    type: 'audio',
    body: '[Voice message]',
    mimeType: message.audioMessage.mimetype || 'audio/ogg',
  };
  if (message.documentMessage) return {
    type: 'file',
    body: `[File: ${message.documentMessage.fileName || 'Attachment'}]`,
    fileName: message.documentMessage.fileName || null,
    mimeType: message.documentMessage.mimetype || 'application/octet-stream',
  };
  if (message.stickerMessage) return { type: 'media', body: '[Sticker]', mimeType: 'image/webp' };
  if (message.contactMessage || message.contactsArrayMessage) return { type: 'media', body: '[Contact]' };
  if (message.locationMessage || message.liveLocationMessage) return { type: 'media', body: '[Location]' };
  return { type: 'media', body: '[WhatsApp message]' };
}

function apiFingerprint(jid, summary) {
  return `${jid}|${summary.type}|${summary.body || ''}|${summary.fileName || ''}`;
}

function rememberApiSend(instance, fingerprint) {
  instance.apiFingerprints.set(fingerprint, Date.now() + 20_000);
}

function isRecentApiSend(instance, fingerprint, messageId) {
  const now = Date.now();
  for (const [key, expiresAt] of instance.apiFingerprints) {
    if (expiresAt <= now) instance.apiFingerprints.delete(key);
  }
  if (messageId && instance.apiMessageIds.has(messageId)) {
    instance.apiMessageIds.delete(messageId);
    return true;
  }
  const expiresAt = instance.apiFingerprints.get(fingerprint);
  if (expiresAt && expiresAt > now) {
    instance.apiFingerprints.delete(fingerprint);
    return true;
  }
  return false;
}

async function emitWebhook(instanceId, event, data) {
  const payload = JSON.stringify({ instanceId, event, data, emittedAt: new Date().toISOString() });
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(CRM_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-whatsapp-signature': signature,
        },
        body: payload,
      });
      if (response.ok) return;
      lastError = new Error(`CRM webhook returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  logger.warn({ instanceId, event, err: lastError?.message }, 'CRM webhook delivery failed');
}

function publicStatus(instanceId, instance) {
  return {
    instanceId,
    status: instance?.status || 'disconnected',
    connected: instance?.status === 'connected',
    phone: instance?.phone || null,
    qrDataUrl: instance?.status === 'qr' ? instance.qrDataUrl || null : null,
    lastError: instance?.lastError || null,
  };
}

async function startInstance(instanceId) {
  const id = safeInstanceId(instanceId);
  if (!id) throw new Error('Invalid WhatsApp instance ID.');
  const existing = instances.get(id);
  if (existing?.starting || existing?.status === 'connected' || existing?.status === 'qr' || existing?.status === 'connecting') {
    return existing;
  }

  const instance = existing || {
    sock: null,
    status: 'connecting',
    starting: false,
    qrDataUrl: null,
    phone: null,
    lastError: null,
    reconnectTimer: null,
    apiMessageIds: new Set(),
    apiFingerprints: new Map(),
  };
  instance.starting = true;
  instance.status = 'connecting';
  instance.lastError = null;
  instances.set(id, instance);

  try {
    const authDir = path.join(AUTH_ROOT, id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, waLogger),
      },
      logger: waLogger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: true,
      generateHighQualityLinkPreview: false,
    });
    instance.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      if (update.qr) {
        instance.status = 'qr';
        instance.qrDataUrl = await QRCode.toDataURL(update.qr, { margin: 1, width: 320 });
        await emitWebhook(id, 'connection.update', { status: 'qr' });
      }

      if (update.connection === 'open') {
        instance.status = 'connected';
        instance.qrDataUrl = null;
        instance.lastError = null;
        instance.phone = normalizePhoneFromJid(sock.user?.id || '');
        await emitWebhook(id, 'connection.update', {
          status: 'connected',
          phone: instance.phone || null,
          name: sock.user?.name || null,
        });
      }

      if (update.connection === 'close') {
        const error = update.lastDisconnect?.error;
        const statusCode = error?.output?.statusCode || error?.statusCode || null;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        instance.status = loggedOut ? 'logged_out' : 'disconnected';
        instance.qrDataUrl = null;
        instance.lastError = error?.message || (loggedOut ? 'WhatsApp linked device was logged out.' : 'WhatsApp connection closed.');
        await emitWebhook(id, 'connection.update', {
          status: instance.status,
          error: instance.lastError,
        });
        if (loggedOut) {
          await rm(path.join(AUTH_ROOT, id), { recursive: true, force: true }).catch(() => undefined);
        } else if (!instance.reconnectTimer) {
          instance.reconnectTimer = setTimeout(() => {
            instance.reconnectTimer = null;
            instance.sock = null;
            void startInstance(id).catch((reconnectError) => {
              logger.warn({ instanceId: id, err: reconnectError.message }, 'WhatsApp reconnect failed');
            });
          }, 3_000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages || []) {
        const rawJid = message.key?.remoteJid;
        if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us') || rawJid.endsWith('@newsletter')) continue;
        const preferredJid = rawJid.endsWith('@lid') && message.key?.remoteJidAlt ? message.key.remoteJidAlt : rawJid;
        const phone = normalizePhoneFromJid(preferredJid);
        if (!phone) continue;
        const summary = messageSummary(message.message);
        const messageId = message.key?.id || '';
        const fromMe = Boolean(message.key?.fromMe);
        const fingerprint = apiFingerprint(preferredJid, summary);
        const origin = fromMe && isRecentApiSend(instance, fingerprint, messageId) ? 'bridge_api' : fromMe ? 'device' : 'customer';
        const timestampValue = typeof message.messageTimestamp === 'number'
          ? message.messageTimestamp
          : Number(message.messageTimestamp || Math.floor(Date.now() / 1000));
        await emitWebhook(id, 'message', {
          id: messageId,
          jid: preferredJid,
          phone,
          fromMe,
          origin,
          pushName: message.pushName || null,
          timestamp: new Date(timestampValue * 1000).toISOString(),
          messageType: summary.type,
          body: summary.body,
          fileName: summary.fileName || null,
          mimeType: summary.mimeType || null,
          mediaAvailableOnDevice: summary.type !== 'text',
        });
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const update of updates || []) {
        if (!update.key?.id || update.update?.status == null) continue;
        await emitWebhook(id, 'message.status', {
          id: update.key.id,
          status: Number(update.update.status),
        });
      }
    });

    return instance;
  } catch (error) {
    instance.status = 'error';
    instance.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    instance.starting = false;
  }
}

async function stopInstance(instanceId, logout = false) {
  const instance = instances.get(instanceId);
  if (instance?.reconnectTimer) clearTimeout(instance.reconnectTimer);
  try {
    if (logout && instance?.sock) await instance.sock.logout();
    else instance?.sock?.end?.(new Error('Bridge session stopped.'));
  } catch {
    // Session cleanup below is authoritative.
  }
  instances.delete(instanceId);
  if (logout) await rm(path.join(AUTH_ROOT, instanceId), { recursive: true, force: true }).catch(() => undefined);
}

async function bootstrapSessions() {
  const entries = await readdir(AUTH_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !safeInstanceId(entry.name)) continue;
    void startInstance(entry.name).catch((error) => {
      logger.warn({ instanceId: entry.name, err: error.message }, 'Unable to restore WhatsApp session');
    });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true, service: 'whatsapp-bridge', instances: instances.size });
    }
    if (!authorized(req)) return json(res, 401, { error: 'Unauthorized.' });

    const match = url.pathname.match(/^\/instances\/([^/]+)(?:\/(.*))?$/);
    if (!match) return json(res, 404, { error: 'Route not found.' });
    const instanceId = safeInstanceId(decodeURIComponent(match[1]));
    const action = match[2] || '';
    if (!instanceId) return json(res, 400, { error: 'Invalid instance ID.' });

    if (req.method === 'POST' && action === 'connect') {
      const instance = await startInstance(instanceId);
      return json(res, 200, publicStatus(instanceId, instance));
    }

    if (req.method === 'GET' && action === 'status') {
      let instance = instances.get(instanceId);
      if (!instance) {
        instance = await startInstance(instanceId).catch(() => null);
      }
      return json(res, 200, publicStatus(instanceId, instance));
    }

    if (req.method === 'DELETE' && action === 'session') {
      await stopInstance(instanceId, true);
      await emitWebhook(instanceId, 'connection.update', { status: 'disconnected' });
      return json(res, 200, { ok: true, instanceId, status: 'disconnected' });
    }

    const instance = instances.get(instanceId);
    if (!instance?.sock || instance.status !== 'connected') {
      return json(res, 409, { error: 'WhatsApp linked device is not connected.' });
    }

    if (req.method === 'POST' && action === 'messages/text') {
      const body = await readJson(req, 256 * 1024);
      const jid = targetJid(body.to);
      const text = String(body.text || '').trim();
      if (!text) return json(res, 400, { error: 'Message text is required.' });
      const summary = { type: 'text', body: text };
      rememberApiSend(instance, apiFingerprint(jid, summary));
      const sent = await instance.sock.sendMessage(jid, { text });
      const messageId = sent?.key?.id || '';
      if (messageId) instance.apiMessageIds.add(messageId);
      return json(res, 200, { ok: true, messageId });
    }

    if (req.method === 'POST' && action === 'messages/media') {
      const body = await readJson(req);
      const jid = targetJid(body.to);
      const mimeType = String(body.mimeType || 'application/octet-stream');
      const fileName = String(body.fileName || 'attachment').slice(0, 240);
      const dataBase64 = String(body.dataBase64 || '');
      if (!dataBase64) return json(res, 400, { error: 'Media data is required.' });
      const buffer = Buffer.from(dataBase64, 'base64');
      if (!buffer.length || buffer.length > 15 * 1024 * 1024) return json(res, 400, { error: 'Media must be 15 MB or smaller.' });

      let content;
      let summary;
      if (mimeType.startsWith('image/')) {
        content = { image: buffer, mimetype: mimeType };
        summary = { type: 'image', body: '[Photo]' };
      } else if (mimeType.startsWith('video/')) {
        content = { video: buffer, mimetype: mimeType };
        summary = { type: 'video', body: '[Video]' };
      } else if (mimeType.startsWith('audio/')) {
        content = { audio: buffer, mimetype: mimeType, ptt: false };
        summary = { type: 'audio', body: '[Voice message]' };
      } else {
        content = { document: buffer, mimetype: mimeType, fileName };
        summary = { type: 'file', body: `[File: ${fileName}]`, fileName };
      }
      rememberApiSend(instance, apiFingerprint(jid, summary));
      const sent = await instance.sock.sendMessage(jid, content);
      const messageId = sent?.key?.id || '';
      if (messageId) instance.apiMessageIds.add(messageId);
      return json(res, 200, { ok: true, messageId });
    }

    return json(res, 404, { error: 'Route not found.' });
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'WhatsApp bridge request failed');
    return json(res, 500, { error: error instanceof Error ? error.message : 'WhatsApp bridge request failed.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'WhatsApp Baileys bridge listening');
  void bootstrapSessions();
});

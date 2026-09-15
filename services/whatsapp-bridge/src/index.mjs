/* eslint-disable react-hooks/rules-of-hooks */
import { createHmac } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
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
  for (let depth = 0; depth < 10; depth += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.viewOnceMessageV2Extension?.message) current = current.viewOnceMessageV2Extension.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else if (current.deviceSentMessage?.message) current = current.deviceSentMessage.message;
    else if (current.editedMessage?.message) current = current.editedMessage.message;
    else if (current.associatedChildMessage?.message) current = current.associatedChildMessage.message;
    else if (current.groupMentionedMessage?.message) current = current.groupMentionedMessage.message;
    else if (current.lottieStickerMessage?.message) current = current.lottieStickerMessage.message;
    else if (current.protocolMessage?.editedMessage?.message) current = current.protocolMessage.editedMessage.message;
    else if (current.protocolMessage?.editedMessage) current = current.protocolMessage.editedMessage;
    else break;
  }
  return current;
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function interactiveReplyText(message) {
  const nativeFlow = message.interactiveResponseMessage?.nativeFlowResponseMessage;
  const paramsJson = nativeFlow?.paramsJson;
  if (typeof paramsJson === 'string' && paramsJson.trim()) {
    try {
      const parsed = JSON.parse(paramsJson);
      if (parsed && typeof parsed === 'object') {
        return firstText(
          parsed.title,
          parsed.display_text,
          parsed.displayText,
          parsed.text,
          parsed.name,
          parsed.id,
          parsed.row_id,
          parsed.selectedRowId
        );
      }
    } catch {
      // Keep checking other interactive fields.
    }
  }
  return firstText(
    message.interactiveResponseMessage?.body?.text,
    nativeFlow?.name
  );
}

function nestedText(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 2) return null;
  const preferredKeys = ['text', 'caption', 'title', 'displayText', 'selectedDisplayText', 'description', 'name'];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  for (const child of Object.values(value)) {
    if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
    const candidate = nestedText(child, depth + 1);
    if (candidate) return candidate;
  }
  return null;
}

function messageSummary(rawMessage) {
  const message = unwrapMessage(rawMessage);
  if (typeof message.conversation === 'string') return { type: 'text', body: message.conversation, hasMedia: false };
  if (typeof message.extendedTextMessage?.text === 'string') return { type: 'text', body: message.extendedTextMessage.text, hasMedia: false };

  const buttonText = firstText(
    message.buttonsResponseMessage?.selectedDisplayText,
    message.buttonsResponseMessage?.selectedButtonId,
    message.templateButtonReplyMessage?.selectedDisplayText,
    message.templateButtonReplyMessage?.selectedId,
    message.listResponseMessage?.title,
    message.listResponseMessage?.description,
    message.listResponseMessage?.singleSelectReply?.selectedRowId,
    interactiveReplyText(message)
  );
  if (buttonText) return { type: 'text', body: buttonText, hasMedia: false };

  const pollName = firstText(
    message.pollCreationMessage?.name,
    message.pollCreationMessageV2?.name,
    message.pollCreationMessageV3?.name
  );
  if (pollName) return { type: 'text', body: pollName, hasMedia: false };

  if (message.imageMessage) return {
    type: 'image',
    body: message.imageMessage.caption || '[Photo]',
    mimeType: message.imageMessage.mimetype || 'image/jpeg',
    hasMedia: true,
  };
  if (message.videoMessage) return {
    type: 'video',
    body: message.videoMessage.caption || '[Video]',
    mimeType: message.videoMessage.mimetype || 'video/mp4',
    hasMedia: true,
  };
  if (message.audioMessage) return {
    type: 'audio',
    body: '[Voice message]',
    mimeType: message.audioMessage.mimetype || 'audio/ogg',
    hasMedia: true,
  };
  if (message.documentMessage) return {
    type: 'file',
    body: message.documentMessage.caption || `[File: ${message.documentMessage.fileName || 'Attachment'}]`,
    fileName: message.documentMessage.fileName || null,
    mimeType: message.documentMessage.mimetype || 'application/octet-stream',
    hasMedia: true,
  };
  if (message.stickerMessage) return {
    type: 'image',
    body: '[Sticker]',
    mimeType: message.stickerMessage.mimetype || 'image/webp',
    hasMedia: true,
  };

  if (message.contactMessage) {
    const name = firstText(message.contactMessage.displayName, message.contactMessage.vcard);
    return { type: 'text', body: name ? `Contact: ${name}` : '[Contact]', hasMedia: false };
  }
  if (message.contactsArrayMessage) {
    const names = Array.isArray(message.contactsArrayMessage.contacts)
      ? message.contactsArrayMessage.contacts.map((contact) => firstText(contact?.displayName)).filter(Boolean)
      : [];
    return { type: 'text', body: names.length ? `Contacts: ${names.join(', ')}` : '[Contacts]', hasMedia: false };
  }
  if (message.locationMessage || message.liveLocationMessage) {
    const location = message.locationMessage || message.liveLocationMessage;
    const lat = Number(location.degreesLatitude);
    const lng = Number(location.degreesLongitude);
    const label = firstText(location.name, location.address);
    const coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat}, ${lng}` : null;
    return { type: 'text', body: firstText(label, coordinates ? `Location: ${coordinates}` : null) || '[Location]', hasMedia: false };
  }
  if (message.reactionMessage?.text) return { type: 'text', body: `Reaction: ${message.reactionMessage.text}`, hasMedia: false };
  if (message.protocolMessage?.type != null) return { type: 'text', body: '[WhatsApp system message]', hasMedia: false };

  const fallback = nestedText(message);
  if (fallback) return { type: 'text', body: fallback, hasMedia: false };
  return { type: 'text', body: '[WhatsApp message]', hasMedia: false };
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

function pruneMediaMessages(instance) {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [id, item] of instance.mediaMessages) {
    if (now - item.receivedAt > maxAge) {
      instance.mediaMessages.delete(id);
    }
  }
  if (instance.mediaMessages.size > 500) {
    const oldestKeys = Array.from(instance.mediaMessages.keys()).slice(0, instance.mediaMessages.size - 500);
    for (const key of oldestKeys) instance.mediaMessages.delete(key);
  }
}

function cacheMediaMessage(instance, message, summary, buffer = null) {
  const messageId = message.key?.id || '';
  if (!messageId || !summary?.hasMedia) return;
  pruneMediaMessages(instance);
  instance.mediaMessages.set(messageId, {
    message,
    summary,
    buffer,
    receivedAt: Date.now(),
  });
}

async function downloadMessageMedia(instance, message, summary) {
  if (!summary?.hasMedia || !instance.sock) return null;
  const messageId = message.key?.id || '';
  try {
    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      { logger: waLogger, reuploadRequest: (msg) => instance.sock?.updateMediaMessage(msg) }
    );
    if (buffer && buffer.length > 0) {
      cacheMediaMessage(instance, message, summary, buffer);
      return buffer;
    }
  } catch (mediaError) {
    logger.warn({ messageId, err: mediaError instanceof Error ? mediaError.message : String(mediaError) }, 'Failed to download WhatsApp media');
  }
  cacheMediaMessage(instance, message, summary, null);
  return null;
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
    mediaMessages: new Map(),
    lidMappings: new Map(),
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
      shouldSyncHistoryMessage: () => true,
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

    function extractMessagePayload(message, instanceRef, contactMap) {
      const rawJid = message.key?.remoteJid;
      if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us') || rawJid.endsWith('@newsletter')) return null;

      let preferredJid = rawJid;
      if (rawJid.endsWith('@lid')) {
        if (message.key?.remoteJidAlt) preferredJid = message.key.remoteJidAlt;
        else if (instanceRef.lidMappings?.has(rawJid)) preferredJid = instanceRef.lidMappings.get(rawJid);
      }
      const phone = normalizePhoneFromJid(preferredJid);
      if (!phone) return null;

      const summary = messageSummary(message.message);
      const messageId = message.key?.id || '';
      const fromMe = Boolean(message.key?.fromMe);
      const fingerprint = apiFingerprint(preferredJid, summary);
      const origin = fromMe && isRecentApiSend(instanceRef, fingerprint, messageId) ? 'bridge_api' : fromMe ? 'device' : 'customer';
      const timestampValue = typeof message.messageTimestamp === 'number'
        ? message.messageTimestamp
        : Number(message.messageTimestamp || Math.floor(Date.now() / 1000));

      const pushName = message.pushName || contactMap?.get(preferredJid) || contactMap?.get(rawJid) || null;

      return {
        id: messageId,
        jid: preferredJid,
        phone,
        fromMe,
        origin,
        pushName,
        timestamp: new Date(timestampValue * 1000).toISOString(),
        messageType: summary.type,
        body: summary.body,
        fileName: summary.fileName || null,
        mimeType: summary.mimeType || null,
        mediaAvailableOnDevice: summary.hasMedia === true,
        mediaBase64: null,
        rawSummary: summary,
      };
    }

    sock.ev.on('lid-mapping.update', async ({ lid, pn }) => {
      if (lid && pn) {
        const fullPn = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
        instance.lidMappings.set(lid, fullPn);
        await emitWebhook(id, 'lid-mapping.update', { lid, pn: fullPn });
      }
    });

    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, lidPnMappings, syncType, progress, isLatest }) => {
      logger.info({ count: messages?.length || 0, chatsCount: chats?.length || 0, syncType, progress, isLatest }, 'Received messaging-history.set');
      if (Array.isArray(lidPnMappings)) {
        for (const { lid, pn } of lidPnMappings) {
          if (lid && pn) {
            const fullPn = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
            instance.lidMappings.set(lid, fullPn);
            await emitWebhook(id, 'lid-mapping.update', { lid, pn: fullPn });
          }
        }
      }

      const contactMap = new Map();
      for (const contact of contacts || []) {
        if (contact.id && (contact.notify || contact.name)) {
          contactMap.set(contact.id, contact.notify || contact.name);
        }
      }
      for (const chat of chats || []) {
        if (chat.id && chat.name) {
          contactMap.set(chat.id, chat.name);
        }
      }

      const payloads = [];
      for (const message of messages || []) {
        const payload = extractMessagePayload(message, instance, contactMap);
        if (!payload) continue;
        const summary = payload.rawSummary;
        if (payload.mediaAvailableOnDevice) cacheMediaMessage(instance, message, summary, null);
        delete payload.rawSummary;
        payloads.push(payload);
      }

      const batchSize = 50;
      const batchTotal = Math.max(1, Math.ceil(payloads.length / batchSize));
      for (let offset = 0; offset < payloads.length; offset += batchSize) {
        const batchIndex = Math.floor(offset / batchSize);
        await emitWebhook(id, 'messages.batch', {
          messages: payloads.slice(offset, offset + batchSize),
          sync_type: syncType == null ? null : String(syncType),
          progress: Number.isFinite(Number(progress)) ? Number(progress) : null,
          is_latest: Boolean(isLatest),
          batch_index: batchIndex,
          batch_total: batchTotal,
        });
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const message of messages || []) {
        const payload = extractMessagePayload(message, instance);
        if (!payload) continue;
        const summary = payload.rawSummary;
        delete payload.rawSummary;

        if (payload.mediaAvailableOnDevice) {
          const buffer = await downloadMessageMedia(instance, message, summary);
          if (buffer && buffer.length <= 12 * 1024 * 1024) {
            payload.mediaBase64 = buffer.toString('base64');
          }
        }

        await emitWebhook(id, 'message', payload);
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

    const mediaMatch = action.match(/^messages\/([^/]+)\/media$/);
    if (req.method === 'GET' && mediaMatch) {
      const messageId = decodeURIComponent(mediaMatch[1]);
      const currentInstance = instances.get(instanceId);
      if (!currentInstance) {
        return json(res, 404, { error: 'Instance not found.' });
      }
      const cached = currentInstance.mediaMessages?.get(messageId);
      if (!cached) {
        return json(res, 404, { error: 'Media not found or expired.' });
      }
      let buffer = cached.buffer;
      if (!buffer && currentInstance.sock) {
        try {
          buffer = await downloadMediaMessage(
            cached.message,
            'buffer',
            {},
            { logger: waLogger, reuploadRequest: (msg) => currentInstance.sock?.updateMediaMessage(msg) }
          );
          cached.buffer = buffer;
        } catch (downloadErr) {
          logger.warn({ messageId, err: downloadErr instanceof Error ? downloadErr.message : String(downloadErr) }, 'On-demand media download failed');
          return json(res, 502, { error: 'Failed to download media from WhatsApp.' });
        }
      }
      if (!buffer) {
        return json(res, 404, { error: 'Media is empty or unavailable.' });
      }

      const mime = cached.summary?.mimeType || 'application/octet-stream';
      const fileName = cached.summary?.fileName || `attachment-${messageId}`;
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': buffer.length,
        'Content-Disposition': `inline; filename=\"${encodeURIComponent(fileName)}\"`,
        'Cache-Control': 'private, max-age=86400',
      });
      return res.end(buffer);
    }

    const instance = instances.get(instanceId);
    if (!instance?.sock || instance.status !== 'connected') {
      return json(res, 409, { error: 'WhatsApp linked device is not connected.' });
    }

    const historyMatch = action.match(/^chats\/([^/]+)\/fetch-history$/);
    if (req.method === 'POST' && historyMatch) {
      const rawChatJid = decodeURIComponent(historyMatch[1]);
      const body = await readJson(req, 64 * 1024);
      const count = Math.min(100, Math.max(1, Number(body.count || 50)));
      const oldestMsgId = String(body.oldestMsgId || '');
      const oldestMsgFromMe = Boolean(body.oldestMsgFromMe);
      const rawTimestamp = Number(body.oldestMsgTimestamp || Date.now());
      const oldestMsgTimestamp = Number.isFinite(rawTimestamp) && rawTimestamp < 1_000_000_000_000
        ? rawTimestamp * 1000
        : rawTimestamp;

      const oldestKey = oldestMsgId ? {
        remoteJid: rawChatJid,
        id: oldestMsgId,
        fromMe: oldestMsgFromMe,
      } : undefined;

      const result = await instance.sock.fetchMessageHistory(count, oldestKey, oldestMsgTimestamp);
      return json(res, 200, { ok: true, result, request_id: result || null });
    }

    if (req.method === 'POST' && action === 'messages/text') {
      const body = await readJson(req, 256 * 1024);
      const jid = targetJid(body.to);
      const text = String(body.text || '').trim();
      if (!text) return json(res, 400, { error: 'Message text is required.' });
      const summary = { type: 'text', body: text, hasMedia: false };
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
        summary = { type: 'image', body: '[Photo]', mimeType, hasMedia: true };
      } else if (mimeType.startsWith('video/')) {
        content = { video: buffer, mimetype: mimeType };
        summary = { type: 'video', body: '[Video]', mimeType, hasMedia: true };
      } else if (mimeType.startsWith('audio/')) {
        content = { audio: buffer, mimetype: mimeType, ptt: false };
        summary = { type: 'audio', body: '[Voice message]', mimeType, hasMedia: true };
      } else {
        content = { document: buffer, mimetype: mimeType, fileName };
        summary = { type: 'file', body: `[File: ${fileName}]`, fileName, mimeType, hasMedia: true };
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

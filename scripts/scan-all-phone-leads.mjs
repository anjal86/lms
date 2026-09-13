import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { createDecipheriv } from 'node:crypto';

function loadEnv() {
  const env = { ...process.env };
  if (!fs.existsSync('.env.local')) return env;
  const envContent = fs.readFileSync('.env.local', 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !env[match[1].trim()]) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const encryptionKeyRaw = env.INTEGRATION_TOKEN_ENCRYPTION_KEY;

if (!supabaseUrl || !serviceRoleKey || !encryptionKeyRaw) {
  console.error('Missing credentials in .env.local');
  process.exit(1);
}

const encryptionKey = /^[0-9a-f]{64}$/i.test(encryptionKeyRaw)
  ? Buffer.from(encryptionKeyRaw, 'hex')
  : Buffer.from(encryptionKeyRaw, 'base64');
const AAD_V2 = Buffer.from('travel-lms:integration-secret:v2', 'utf8');

function decrypt(value) {
  if (!value || !value.startsWith('enc:v2:')) return value;
  const parts = value.split(':');
  const ivPart = parts[2];
  const tagPart = parts[3];
  const dataPart = parts[4];
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivPart, 'base64url'));
  decipher.setAAD(AAD_V2);
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function extractPhoneNumbers(text) {
  if (!text) return [];
  const regex = /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}\b/g;
  const matches = text.match(regex) || [];
  const valid = [];
  for (const m of matches) {
    const cleaned = m.trim();
    const digitOnly = cleaned.replace(/\D/g, '');
    if (digitOnly.length >= 8 && digitOnly.length <= 15) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) && !valid.includes(cleaned)) {
        valid.push(cleaned);
      }
    }
  }
  return valid;
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('--- Scanning all conversations for phone numbers ---');

  // Load Facebook connection and page token
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('id, provider, config')
    .eq('provider', 'facebook')
    .single();

  const { data: sec } = await supabase
    .from('integration_secrets')
    .select('access_token, secret_payload')
    .eq('connection_id', conn.id)
    .single();

  const pages = conn.config?.pages || [];
  const healthyLifePage = pages.find((p) => p.name?.includes('Healthy Life') || p.id === '106149942188182') || pages[0];
  const pageId = String(healthyLifePage.id);
  console.log(`Target Page: ${healthyLifePage.name} (${pageId})`);

  let token = decrypt(sec.access_token);
  if (sec.secret_payload) {
    try {
      const parsed = typeof sec.secret_payload === 'string' ? JSON.parse(sec.secret_payload) : sec.secret_payload;
      if (Array.isArray(parsed.page_access_tokens)) {
        const found = parsed.page_access_tokens.find((p) => String(p.id) === pageId);
        if (found?.access_token) {
          token = decrypt(found.access_token);
        }
      }
    } catch {}
  }

  // First, check conversations with phone in preview or customer_phone
  const { data: previewMatches } = await supabase
    .from('lead_conversations')
    .select('id, customer_phone, last_message_preview, last_message_at, metadata, provider, lead_id')
    .is('metadata->detected_phone', null);

  let localFound = 0;
  for (const conv of previewMatches || []) {
    const preview = conv.last_message_preview || '';
    const phones = extractPhoneNumbers(preview);
    const existingPhones = (!conv.customer_phone?.startsWith(`${conv.provider}:`))
      ? extractPhoneNumbers(conv.customer_phone)
      : [];
    const allPhones = Array.from(new Set([...phones, ...existingPhones]));

    if (allPhones.length > 0) {
      const meta = conv.metadata || {};
      const patch = {
        metadata: {
          ...meta,
          detected_phone: allPhones[0],
          detected_phones: allPhones,
          detected_phone_snippet: preview.slice(0, 160) || allPhones[0],
          detected_phone_at: conv.last_message_at || new Date().toISOString(),
          detected_phone_source: 'chat_message',
          phone_history_scan_complete: true,
        },
      };
      if (!conv.customer_phone || conv.customer_phone.startsWith(`${conv.provider}:`)) {
        patch.customer_phone = allPhones[0];
      }
      await supabase.from('lead_conversations').update(patch).eq('id', conv.id);
      if (conv.lead_id) {
        await supabase.from('leads').update({ customer_phone: allPhones[0] }).eq('id', conv.lead_id);
      }
      localFound++;
    }
  }
  console.log(`Indexed ${localFound} phone numbers from local previews.`);

  // Now scan remaining from Meta Graph API
  const { count: remainingCount } = await supabase
    .from('lead_conversations')
    .select('id', { count: 'exact', head: true })
    .is('metadata->detected_phone', null)
    .or('metadata->phone_history_scan_complete.is.null,metadata->phone_history_scan_complete.eq.false');

  console.log(`Remaining unscanned conversations: ${remainingCount}`);

  let totalScanned = 0;
  let totalPhonesFound = 0;
  const BATCH = 30;

  while (true) {
    const { data: batch, error } = await supabase
      .from('lead_conversations')
      .select('id, lead_id, customer_name, customer_phone, metadata, provider, connection_id, last_message_at')
      .is('metadata->detected_phone', null)
      .or('metadata->phone_history_scan_complete.is.null,metadata->phone_history_scan_complete.eq.false')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(BATCH);

    if (error || !batch || batch.length === 0) break;

    // Concurrently process the batch with concurrency of 5
    const concurrency = 5;
    let index = 0;

    const worker = async () => {
      while (index < batch.length) {
        const item = batch[index++];
        const convMeta = item.metadata || {};
        const metaConvId = convMeta.meta_conversation_id;

        if (!metaConvId) {
          await supabase.from('lead_conversations').update({
            metadata: { ...convMeta, phone_history_scan_complete: true, phone_history_scan_error: 'No Meta conversation ID' },
          }).eq('id', item.id);
          totalScanned++;
          continue;
        }

        try {
          const url = `https://graph.facebook.com/v26.0/${metaConvId}/messages?fields=id,created_time,from,message&limit=100&access_token=${token}`;
          const res = await fetch(url);
          const data = await res.json();

          if (data.error) {
            await supabase.from('lead_conversations').update({
              metadata: {
                ...convMeta,
                phone_history_scan_complete: true,
                phone_history_scan_error: data.error.message?.slice(0, 200),
              },
            }).eq('id', item.id);
            totalScanned++;
            continue;
          }

          const messages = data.data || [];
          let foundPhone = null;
          let foundSnippet = '';
          let foundTime = null;

          // Insert fetched messages into lead_messages so history is cached
          const msgRows = messages
            .filter((m) => m.id)
            .map((m) => {
              const senderId = String(m.from?.id || '');
              const body = typeof m.message === 'string' ? m.message.trim() : null;
              return {
                conversation_id: item.id,
                lead_id: item.lead_id,
                connection_id: item.connection_id,
                provider: item.provider,
                external_message_id: String(m.id),
                direction: senderId === pageId ? 'outbound' : 'inbound',
                message_type: 'text',
                body,
                metadata: { from: m.from, history_scan: true },
                delivery_status: 'sent',
                sent_at: m.created_time || new Date().toISOString(),
              };
            });

          if (msgRows.length) {
            await supabase.from('lead_messages').upsert(msgRows, { onConflict: 'provider,external_message_id', ignoreDuplicates: true });
          }

          for (const msg of messages) {
            const senderId = String(msg.from?.id || '');
            if (senderId === pageId) continue;
            const text = typeof msg.message === 'string' ? msg.message.trim() : '';
            if (!text) continue;
            const phones = extractPhoneNumbers(text);
            if (phones.length) {
              foundPhone = phones[0];
              foundSnippet = text.slice(0, 160);
              foundTime = msg.created_time || new Date().toISOString();
              break;
            }
          }

          if (foundPhone) {
            const patch = {
              metadata: {
                ...convMeta,
                detected_phone: foundPhone,
                detected_phones: [foundPhone],
                detected_phone_snippet: foundSnippet,
                detected_phone_at: foundTime,
                detected_phone_source: 'meta_history_scan',
                phone_history_scan_complete: true,
                phone_history_scanned_at: new Date().toISOString(),
              },
            };
            if (!item.customer_phone || item.customer_phone.startsWith(`${item.provider}:`)) {
              patch.customer_phone = foundPhone;
            }
            await supabase.from('lead_conversations').update(patch).eq('id', item.id);
            if (item.lead_id) {
              await supabase.from('leads').update({ customer_phone: foundPhone }).eq('id', item.lead_id);
            }
            totalPhonesFound++;
            console.log(`[+] Found phone ${foundPhone} for ${item.customer_name || 'Traveler'}`);
          } else {
            await supabase.from('lead_conversations').update({
              metadata: {
                ...convMeta,
                phone_history_scan_complete: true,
                phone_history_scanned_at: new Date().toISOString(),
              },
            }).eq('id', item.id);
          }
        } catch (fetchErr) {
          console.warn(`Error on conv ${item.id}:`, fetchErr.message);
        }

        totalScanned++;
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`Progress: ${totalScanned} scanned, ${totalPhonesFound} phone leads found so far.`);

    // If we've processed 150 in a batch, let's keep going until all are processed
    if (batch.length < BATCH) break;
  }

  console.log(`\n=== SCAN COMPLETE ===`);
  console.log(`Total scanned: ${totalScanned}`);
  console.log(`Total phone leads found: ${totalPhonesFound + localFound}`);
}

main().catch(console.error);

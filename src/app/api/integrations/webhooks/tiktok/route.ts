import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ingestNormalizedLead } from '@/lib/integrations/ingest';

export const runtime = 'nodejs';

function verifyTikTokSignature(raw: string, header: string | null) {
  const secret = process.env.TIKTOK_APP_SECRET?.trim();
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, rest.join('=')];
  }));
  const timestamp = parts.t;
  const signature = parts.s;
  if (!timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function scalar(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function fieldValue(entry: Record<string, unknown>, names: string[]) {
  const wanted = new Set(names.map((item) => item.toLowerCase()));
  const candidates = [entry.changes, entry.field_data, entry.fields, entry.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (!item || typeof item !== 'object') continue;
        const field = item as Record<string, unknown>;
        const name = String(field.field || field.name || field.field_name || field.key || '').toLowerCase();
        if (!wanted.has(name)) continue;
        const value = field.value ?? field.values ?? field.answer;
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number') return String(value);
        if (Array.isArray(value) && value.length) return String(value[0]);
        if (value && typeof value === 'object') {
          const record = value as Record<string, unknown>;
          const nested = record.value ?? record.text ?? record.answer;
          if (typeof nested === 'string' && nested.trim()) return nested.trim();
        }
      }
    } else if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (!wanted.has(key.toLowerCase())) continue;
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number') return String(value);
      }
    }
  }
  return scalar(entry, names);
}

async function findConnection(advertiserId: string | null) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('integration_connections')
    .select('id,config')
    .eq('provider', 'tiktok')
    .eq('status', 'connected');
  const connections = data || [];
  if (!advertiserId) return connections[0] || null;
  return connections.find((connection) => {
    const config = (connection.config || {}) as Record<string, unknown>;
    const ids = Array.isArray(config.advertiser_ids) ? config.advertiser_ids.map(String) : [];
    return ids.includes(advertiserId);
  }) || connections[0] || null;
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyTikTokSignature(raw, request.headers.get('TikTok-Signature') || request.headers.get('tiktok-signature'))) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (Number(payload.object) !== 1 && payload.object !== 'LEAD') {
    return NextResponse.json({ received: true, processed: false, count: 0 });
  }

  const advertiserId = scalar(payload, ['adv_id', 'advertiser_id']);
  const connection = await findConnection(advertiserId);
  if (!connection) {
    return NextResponse.json({ received: true, processed: false, error: 'No connected TikTok advertiser.' });
  }

  const entries = Array.isArray(payload.entry)
    ? payload.entry as Array<Record<string, unknown>>
    : payload.content && typeof payload.content === 'object'
      ? [payload.content as Record<string, unknown>]
      : [payload];

  let processed = 0;
  for (const entry of entries) {
    const leadId = scalar(entry, ['lead_id', 'id', 'leadId']) || `${payload.request_id || payload.log_id || Date.now()}-${processed}`;
    const fullName = fieldValue(entry, ['full_name', 'name', 'customer_name']);
    const firstName = fieldValue(entry, ['first_name']);
    const lastName = fieldValue(entry, ['last_name']);

    try {
      await ingestNormalizedLead({
        provider: 'tiktok',
        connectionId: connection.id,
        externalEventId: `tiktok:lead:${leadId}`,
        eventType: 'lead',
        externalLeadId: leadId,
        customerName: fullName || [firstName, lastName].filter(Boolean).join(' ') || null,
        customerPhone: fieldValue(entry, ['phone_number', 'phone', 'mobile', 'mobile_number']),
        customerEmail: fieldValue(entry, ['email', 'email_address']),
        destination: fieldValue(entry, ['destination', 'travel_destination']),
        travelDates: fieldValue(entry, ['travel_dates', 'travel_date', 'departure_date', 'scheduled_time']),
        budgetRange: fieldValue(entry, ['budget', 'budget_range']),
        sourceLabel: 'TikTok Lead Generation',
        campaign: scalar(entry, ['campaign_name', 'campaign_id']),
        ad: scalar(entry, ['ad_name', 'ad_id']),
        form: scalar(entry, ['page_name', 'page_id', 'form_id']),
        notes: 'Imported automatically from TikTok Lead Generation.',
        metadata: {
          advertiser_id: advertiserId,
          payload: entry,
          request_id: payload.request_id || null,
          webhook_time: payload.time || null,
        },
      });
      processed += 1;
    } catch (error) {
      console.error('TikTok lead ingestion failed:', error);
    }
  }

  return NextResponse.json({ received: true, processed: processed > 0, count: processed });
}

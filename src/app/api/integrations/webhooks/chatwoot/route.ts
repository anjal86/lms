import { NextResponse } from 'next/server';
import { chatwootServerConfig } from '@/lib/integrations/chatwoot-client';
import {
  chatwootAccountId,
  chatwootDeliveryKey,
  type ChatwootWebhookEnvelope,
  verifyChatwootWebhook,
} from '@/lib/integrations/chatwoot-webhook';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isEnvelope(value: unknown): value is ChatwootWebhookEnvelope {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let config: ReturnType<typeof chatwootServerConfig>;
  try {
    config = chatwootServerConfig();
  } catch (error) {
    console.error('Chatwoot webhook configuration error:', error);
    return NextResponse.json({ error: 'Chatwoot integration is not configured.' }, { status: 503 });
  }

  const timestamp = request.headers.get('x-chatwoot-timestamp');
  const verification = verifyChatwootWebhook({
    rawBody,
    signature: request.headers.get('x-chatwoot-signature'),
    timestamp,
    secret: config.webhookSecret,
    maxAgeSeconds: config.webhookMaxAgeSeconds,
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: 'Invalid Chatwoot webhook signature.', reason: verification.reason },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid Chatwoot webhook JSON.' }, { status: 400 });
  }

  if (!isEnvelope(payload)) {
    return NextResponse.json({ error: 'Invalid Chatwoot webhook payload.' }, { status: 400 });
  }

  const eventType = typeof payload.event === 'string' ? payload.event.trim() : '';
  const accountId = chatwootAccountId(payload);
  if (!eventType || !accountId) {
    return NextResponse.json({ error: 'Chatwoot webhook is missing event/account identity.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: accountLink, error: accountError } = await admin
    .from('chatwoot_accounts')
    .select('id,workspace_id,status')
    .eq('chatwoot_account_id', accountId)
    .maybeSingle();

  if (accountError) {
    console.error('Failed to resolve Chatwoot account mapping:', accountError.message);
    return NextResponse.json({ error: 'Unable to resolve Chatwoot account.' }, { status: 500 });
  }

  // A webhook may be enabled before a CRM workspace is mapped. Acknowledge it
  // without creating a retry storm; the setup UI/health check will surface it.
  if (!accountLink || accountLink.status !== 'active') {
    console.warn(`Ignoring Chatwoot webhook for unmapped/disabled account ${accountId}.`);
    return NextResponse.json({ accepted: false, ignored: true, reason: 'unmapped_account' }, { status: 202 });
  }

  const deliveryKey = chatwootDeliveryKey(
    request.headers.get('x-chatwoot-delivery'),
    String(timestamp),
    rawBody
  );

  const { error: insertError } = await admin.from('chatwoot_webhook_events').insert({
    delivery_key: deliveryKey,
    workspace_id: accountLink.workspace_id,
    chatwoot_account_link_id: accountLink.id,
    chatwoot_account_id: accountId,
    event_type: eventType,
    payload,
    status: 'pending',
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ accepted: true, duplicate: true }, { status: 200 });
    }
    console.error('Failed to persist Chatwoot webhook:', insertError.message);
    return NextResponse.json({ error: 'Unable to persist Chatwoot webhook.' }, { status: 500 });
  }

  return NextResponse.json({ accepted: true }, { status: 202 });
}

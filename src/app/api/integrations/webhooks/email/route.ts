import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ingestNormalizedLead } from '@/lib/integrations/ingest';

export const runtime = 'nodejs';

const EmailPayloadSchema = z.object({
  message_id: z.string().trim().min(1).max(500),
  thread_id: z.string().trim().max(500).optional(),
  from_email: z.string().trim().email(),
  from_name: z.string().trim().max(160).optional(),
  subject: z.string().trim().max(500).optional(),
  text: z.string().max(20000).optional(),
  html: z.string().max(100000).optional(),
  phone: z.string().trim().max(40).optional(),
  destination: z.string().trim().max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function secureEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function emailConnection() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('integration_connections')
    .select('id')
    .eq('provider', 'email')
    .eq('status', 'connected')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(request: Request) {
  const secret = process.env.EMAIL_INGEST_SECRET?.trim() || process.env.LEADS_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Email ingestion is not configured.' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') || '';
  const received = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-webhook-secret') || '';
  if (!received || !secureEqual(received, secret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const parsed = EmailPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const data = parsed.data;
    const connectionId = await emailConnection();
    const result = await ingestNormalizedLead({
      provider: 'email',
      connectionId,
      externalEventId: `email:${data.message_id}`,
      eventType: 'message',
      externalThreadId: data.thread_id || data.from_email,
      externalContactId: data.from_email,
      customerName: data.from_name || data.from_email.split('@')[0],
      customerPhone: data.phone || `email:${data.from_email}`,
      customerEmail: data.from_email,
      destination: data.destination || 'Not specified',
      sourceLabel: 'Email inquiry',
      notes: data.subject ? `Email subject: ${data.subject}` : 'Created from an inbound inquiry email.',
      message: {
        externalMessageId: data.message_id,
        type: 'email',
        body: data.text || data.subject || 'Inbound email received.',
        metadata: { subject: data.subject || null, html: data.html || null, ...(data.metadata || {}) },
      },
      metadata: { subject: data.subject || null, ...(data.metadata || {}) },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Email ingestion failed:', error);
    return NextResponse.json({ error: 'Unable to ingest email.' }, { status: 500 });
  }
}

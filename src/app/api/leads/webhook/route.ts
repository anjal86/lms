import { timingSafeEqual, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const LeadWebhookSchema = z.object({
  customer_name: z.string().trim().min(1).max(160),
  customer_phone: z.string().trim().min(5).max(40),
  customer_email: z.string().trim().email().max(254).optional().or(z.literal('')),
  destination: z.string().trim().min(1).max(160),
  budget_range: z.string().trim().max(120).optional(),
  travel_dates: z.string().trim().max(160).optional(),
  pax_adults: z.coerce.number().int().min(0).max(100).optional(),
  pax_children: z.coerce.number().int().min(0).max(100).optional(),
  pax_infants: z.coerce.number().int().min(0).max(100).optional(),
  travel_type: z.string().trim().max(80).optional(),
  special_notes: z.string().trim().max(5000).optional(),
  source: z.string().trim().max(80).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  external_id: z.string().trim().max(200).optional(),
});

function secretsEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.LEADS_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.length < 32) {
    console.error('LEADS_WEBHOOK_SECRET is missing or too short.');
    return NextResponse.json({ error: 'Webhook ingestion is not configured.' }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const prefix = 'Bearer ';
  const receivedSecret = authHeader.startsWith(prefix) ? authHeader.slice(prefix.length) : '';
  if (!receivedSecret || !secretsEqual(receivedSecret, webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = LeadWebhookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const source = data.source || 'webhook';
  const idempotencyKey = req.headers.get('idempotency-key')?.trim() || data.external_id || randomUUID();
  if (idempotencyKey.length > 250) {
    return NextResponse.json({ error: 'Idempotency key is too long.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error: eventError } = await admin
    .from('webhook_events')
    .insert({ idempotency_key: idempotencyKey, source });

  if (eventError) {
    if (eventError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
    }
    console.error('Webhook idempotency write failed:', eventError.message);
    return NextResponse.json({ error: 'Unable to accept webhook.' }, { status: 500 });
  }

  try {
    const payload = {
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email || null,
      destination: data.destination,
      budget_range: data.budget_range || null,
      travel_dates: data.travel_dates || null,
      pax_adults: data.pax_adults ?? 2,
      pax_children: data.pax_children ?? 0,
      pax_infants: data.pax_infants ?? 0,
      travel_type: data.travel_type || 'family',
      special_notes: data.special_notes || null,
      source,
      external_id: data.external_id || idempotencyKey,
      stage: 'new',
      priority: data.priority || 'normal',
      assigned_to: null,
      assigned_at: null,
    };

    const { data: insertedLead, error: insertError } = await admin
      .from('leads')
      .insert(payload)
      .select('*')
      .single();
    if (insertError) throw insertError;

    const { data: assignedTo, error: routingError } = await admin.rpc('route_lead_atomic', {
      p_lead_id: insertedLead.id,
      p_destination: data.destination,
      p_excluded_agent: null,
      p_force: false,
    });
    if (routingError) throw routingError;

    const { data: lead, error: reloadError } = await admin
      .from('leads')
      .select('*')
      .eq('id', insertedLead.id)
      .single();
    if (reloadError) throw reloadError;

    if (assignedTo) {
      const { error: notificationError } = await admin.from('notifications').insert({
        user_id: assignedTo,
        title: 'New Lead Assigned',
        message: `${lead.customer_name} (${lead.destination}) has been routed to you.`,
        type: 'lead_assigned',
        link: `/leads/${lead.id}`,
      });
      if (notificationError) {
        console.error('Lead assignment notification failed:', notificationError.message);
      }
    }

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (error) {
    console.error('Webhook ingestion failed:', error);
    await admin.from('webhook_events').delete().eq('idempotency_key', idempotencyKey);
    return NextResponse.json({ error: 'Unable to persist lead.' }, { status: 500 });
  }
}

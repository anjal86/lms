import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { ingestNormalizedLead, type NormalizedChannelLead } from '@/lib/integrations/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) {
    return NextResponse.json({ error: 'Only managers can replay failed channel events.' }, { status: 403 });
  }

  let body: { eventId?: string };
  try {
    body = await request.json() as { eventId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!body.eventId) return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: event, error } = await admin
    .from('inbound_channel_events')
    .select('id,status,payload,next_retry_at')
    .eq('id', body.eventId)
    .maybeSingle();
  if (error || !event) return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  if (!['failed', 'received'].includes(event.status)) {
    return NextResponse.json({ error: `Event is ${event.status} and cannot be replayed.` }, { status: 409 });
  }

  // Manual replay deliberately clears backoff. claim_inbound_channel_event still serializes
  // competing workers, so an admin replay cannot double-process an event.
  await admin
    .from('inbound_channel_events')
    .update({ next_retry_at: null, processing_started_at: null, status: 'failed' })
    .eq('id', event.id);

  try {
    const result = await ingestNormalizedLead(event.payload as NormalizedChannelLead);
    return NextResponse.json({ success: true, result });
  } catch (replayError) {
    console.error('Failed event replay:', replayError);
    return NextResponse.json({ error: 'Replay failed; the event remains retryable.' }, { status: 500 });
  }
}

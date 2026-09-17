import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { attributionFromConversationMetadata, resolveAdKnowledge } from '@/lib/ai/ad-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;

  const { data: conversation, error: conversationError } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id,metadata')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', id)
    .maybeSingle();
  if (conversationError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  const { data: rows, error } = await actor.supabase
    .from('conversation_attributions')
    .select('id,provider,origin,platform,source_type,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,source_id,source_url,headline,body,media_type,media_url,ctwa_clid,is_first_touch,captured_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .order('captured_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Unable to load conversation attribution.' }, { status: 500 });

  const firstFromRows = (rows || []).find((row) => row.is_first_touch) || rows?.[0] || null;
  const firstTouch = firstFromRows || attributionFromConversationMetadata(conversation.metadata);
  const latest = rows?.length ? rows[rows.length - 1] : firstTouch;

  let knowledge = null;
  try {
    knowledge = await resolveAdKnowledge(actor.profile.workspace_id, firstTouch);
  } catch (knowledgeError) {
    console.warn('Conversation ad knowledge lookup failed:', knowledgeError);
  }

  return NextResponse.json({
    first_touch: firstTouch,
    latest,
    knowledge,
    touch_count: rows?.length || (firstTouch ? 1 : 0),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

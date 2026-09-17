import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { normalizeChatwootMessage } from '@/lib/integrations/chatwoot-adapter';
import { listChatwootMessages } from '@/lib/integrations/chatwoot-client';
import { resolveActiveChatwootRuntime } from '@/lib/integrations/chatwoot-runtime';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  before: z.coerce.number().int().positive(),
});

function messageId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parsed = Number((value as Record<string, unknown>).id);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ before: url.searchParams.get('before') });
  if (!parsedId.success || !parsed.success) {
    return NextResponse.json({ error: 'Invalid conversation history request.' }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await actor.supabase
    .from('lead_conversations')
    .select('id,workspace_id')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsedId.data)
    .maybeSingle();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  let runtime;
  try {
    runtime = await resolveActiveChatwootRuntime(actor.profile.workspace_id, parsedId.data);
  } catch (error) {
    console.error('Active Chatwoot history runtime resolution failed:', error);
    return NextResponse.json({ error: 'Unable to resolve Chatwoot conversation.' }, { status: 502 });
  }

  if (!runtime) {
    return NextResponse.json({ error: 'This conversation is not using active Chatwoot history.' }, { status: 409 });
  }

  try {
    const result = await listChatwootMessages({
      accountId: runtime.accountId,
      conversationId: runtime.conversationId,
      before: parsed.data.before,
    });

    const messages = result.messages
      .map((message) => normalizeChatwootMessage(message, parsedId.data))
      .sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
    const ids = result.messages
      .map(messageId)
      .filter((value): value is number => value !== null);
    const nextBefore = ids.length ? Math.min(...ids) : null;

    return NextResponse.json({
      messages,
      nextBefore,
      hasOlderMessages: result.messages.length >= 20 && nextBefore !== null,
      messageSource: 'chatwoot',
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Inbox-Source': 'chatwoot',
      },
    });
  } catch (error) {
    console.error('Active Chatwoot history load failed:', error);
    return NextResponse.json({ error: 'Unable to load older Chatwoot messages.' }, { status: 502 });
  }
}

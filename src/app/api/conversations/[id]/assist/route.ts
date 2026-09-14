import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({ action: z.enum(['summary','reply','extract']) });

type MessageRow = { direction: 'inbound' | 'outbound' | 'internal'; body: string | null; sent_at: string };

function transcript(messages: MessageRow[]) {
  return messages.map((message) => `${message.direction === 'inbound' ? 'Customer' : message.direction === 'internal' ? 'Internal note' : 'Agent'}: ${message.body || '[attachment]'}`).join('\n');
}

function localSummary(messages: MessageRow[]) {
  const customer = messages.filter((message) => message.direction === 'inbound' && message.body).slice(-4);
  const agent = messages.filter((message) => message.direction === 'outbound' && message.body).slice(-2);
  if (!customer.length && !agent.length) return 'No text messages are available to summarize yet.';
  const latestCustomer = customer.at(-1)?.body?.trim();
  const previousContext = customer.slice(0, -1).map((message) => message.body?.trim()).filter(Boolean).slice(-2);
  const lastAgent = agent.at(-1)?.body?.trim();
  return [
    previousContext.length ? `Earlier customer context: ${previousContext.join(' · ')}` : '',
    latestCustomer ? `Latest customer message: ${latestCustomer}` : '',
    lastAgent ? `Latest agent response: ${lastAgent}` : 'No agent reply has been sent yet.',
  ].filter(Boolean).join('\n');
}

function localReply(messages: MessageRow[]) {
  const latest = [...messages].reverse().find((message) => message.direction === 'inbound' && message.body)?.body?.trim() || '';
  if (!latest) return 'Thanks for reaching out. How can I help you today?';
  const compact = latest.replace(/\s+/g, ' ').slice(0, 160);
  return `Thanks for your message. I’ve noted your request${compact ? ` about “${compact}”` : ''}. I’ll review the details and help you with the next step.`;
}

function localExtract(messages: MessageRow[]) {
  const text = messages.map((message) => message.body || '').join('\n');
  const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].slice(0, 5);
  const phones = [...new Set((text.match(/\+?\d[\d\s().-]{7,}\d/g) || []).map((value) => value.trim()))].slice(0, 5);
  const urls = [...new Set(text.match(/https?:\/\/[^\s]+/gi) || [])].slice(0, 5);
  return { emails, phones, urls };
}

async function providerAssist(action: 'summary' | 'reply' | 'extract', messages: MessageRow[]) {
  const apiUrl = process.env.AI_ASSIST_API_URL?.trim();
  const apiKey = process.env.AI_ASSIST_API_KEY?.trim();
  const model = process.env.AI_ASSIST_MODEL?.trim();
  if (!apiUrl || !apiKey || !model) return null;

  const instruction = action === 'summary'
    ? 'Summarize this CRM conversation in at most 5 concise bullets. Focus on customer intent, constraints, promises already made, unresolved questions, and next action. Do not invent facts.'
    : action === 'reply'
      ? 'Draft one concise, professional reply to the customer. Continue naturally from the conversation, do not invent facts or promises, and do not mention that you are AI.'
      : 'Extract only explicit useful CRM facts from the conversation. Return strict JSON with keys: emails, phones, dates, locations, intent, budget, notes. Use null or empty arrays when absent. Do not infer facts that were not stated.';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: action === 'reply' ? 0.4 : 0.1,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: transcript(messages) },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Assist provider returned ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Assist provider returned an empty result');
  return content;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'inbox.view'))) return NextResponse.json({ error: 'Inbox access required.' }, { status: 403 });
  const { id } = await context.params;

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid assist action.' }, { status: 400 });

  const { data: conversation } = await actor.supabase.from('lead_conversations').select('id').eq('workspace_id', actor.profile.workspace_id).eq('id', id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data, error } = await actor.supabase
    .from('lead_messages')
    .select('direction,body,sent_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('conversation_id', id)
    .order('sent_at', { ascending: false })
    .limit(80);
  if (error) return NextResponse.json({ error: 'Unable to load conversation messages.' }, { status: 500 });
  const messages = ([...(data || [])].reverse()) as MessageRow[];

  try {
    const providerResult = await providerAssist(parsed.data.action, messages);
    if (providerResult) {
      if (parsed.data.action === 'extract') {
        try {
          const cleaned = providerResult.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
          return NextResponse.json({ mode: 'provider', action: parsed.data.action, data: JSON.parse(cleaned) });
        } catch {
          return NextResponse.json({ mode: 'provider', action: parsed.data.action, result: providerResult });
        }
      }
      return NextResponse.json({ mode: 'provider', action: parsed.data.action, result: providerResult });
    }
  } catch (providerError) {
    console.error('Conversation assist provider failed; using local fallback:', providerError);
  }

  if (parsed.data.action === 'summary') return NextResponse.json({ mode: 'local', action: 'summary', result: localSummary(messages) });
  if (parsed.data.action === 'reply') return NextResponse.json({ mode: 'local', action: 'reply', result: localReply(messages) });
  return NextResponse.json({ mode: 'local', action: 'extract', data: localExtract(messages) });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DefinitionSchema = z.object({
  trigger_key: z.string().trim().min(1).max(80),
  conditions: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(z.record(z.string(), z.unknown())).min(1).max(25),
});
const TestSchema = z.object({
  conversation_id: z.string().uuid(),
  workflow_id: z.string().uuid().optional(),
  definition: DefinitionSchema.optional(),
}).refine((value) => Boolean(value.workflow_id || value.definition), { message: 'workflow_id or definition is required' });

function actionLabel(action: Record<string, unknown>) {
  const type = String(action.type || 'action');
  if (type === 'assign') return `Assign · ${String(action.user_id || action.strategy || 'least_open').replaceAll('_', ' ')}`;
  if (type === 'set_priority') return `Set priority · ${String(action.value || 'normal')}`;
  if (type === 'set_state') return String(action.value) === 'snoozed' ? `Snooze · ${Number(action.minutes || 60)} min` : `Set state · ${String(action.value || 'open')}`;
  if (type === 'set_lifecycle') return `Set lifecycle · ${String(action.value || 'new')}`;
  if (type === 'add_tag') return `Add tag · ${String(action.value || '')}`;
  if (type === 'remove_tag') return `Remove tag · ${String(action.value || '')}`;
  if (type === 'set_next_action') return `Next action · ${Number(action.minutes || 60)} min`;
  return type.replaceAll('_', ' ');
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'automations.view'))) {
    return NextResponse.json({ error: 'Automation access required.' }, { status: 403 });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = TestSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });

  let definition = parsed.data.definition;
  if (parsed.data.workflow_id) {
    const { data: workflow, error } = await actor.supabase
      .from('automation_workflows')
      .select('trigger_key,conditions,actions')
      .eq('workspace_id', actor.profile.workspace_id)
      .eq('id', parsed.data.workflow_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to load workflow.' }, { status: 500 });
    if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
    definition = DefinitionSchema.parse(workflow);
  }
  if (!definition) return NextResponse.json({ error: 'Workflow definition missing.' }, { status: 400 });

  const { data: conversation, error: conversationError } = await actor.supabase
    .from('lead_conversations')
    .select('id,provider,priority,workflow_state,lead_id,contact_id,assigned_to,needs_reply,unread_count,first_response_due_at,next_action_at')
    .eq('workspace_id', actor.profile.workspace_id)
    .eq('id', parsed.data.conversation_id)
    .maybeSingle();
  if (conversationError) return NextResponse.json({ error: 'Unable to load conversation.' }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });

  const { data: contact } = conversation.contact_id
    ? await actor.supabase.from('contacts').select('id,lifecycle_key,tags').eq('workspace_id', actor.profile.workspace_id).eq('id', conversation.contact_id).maybeSingle()
    : { data: null };

  const conditions = definition.conditions || {};
  const checks: Array<{ key: string; expected: unknown; actual: unknown; matched: boolean }> = [];
  const push = (key: string, actual: unknown) => {
    if (!(key in conditions)) return;
    const expected = conditions[key];
    const matched = String(actual ?? '') === String(expected ?? '');
    checks.push({ key, expected, actual, matched });
  };
  push('provider', conversation.provider);
  push('priority', conversation.priority);
  push('workflow_state', conversation.workflow_state);
  if ('has_lead' in conditions) {
    const expected = Boolean(conditions.has_lead);
    const actual = Boolean(conversation.lead_id);
    checks.push({ key: 'has_lead', expected, actual, matched: actual === expected });
  }
  push('lifecycle_key', contact?.lifecycle_key || 'new');

  const matched = checks.every((check) => check.matched);
  const triggerMatches = definition.trigger_key === '*' || ['message_received','reply_sent','state_changed','assigned','priority_changed','lifecycle_changed'].includes(definition.trigger_key);

  return NextResponse.json({
    matched: matched && triggerMatches,
    trigger: { key: definition.trigger_key, valid_for_conversation_events: triggerMatches },
    conditions: checks,
    conversation: {
      id: conversation.id,
      provider: conversation.provider,
      priority: conversation.priority,
      workflow_state: conversation.workflow_state,
      has_lead: Boolean(conversation.lead_id),
      lifecycle_key: contact?.lifecycle_key || 'new',
      assigned_to: conversation.assigned_to,
    },
    actions: definition.actions.map((action, index) => ({ index, type: String(action.type || 'unknown'), label: actionLabel(action), would_execute: matched && triggerMatches })),
    writes_performed: false,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

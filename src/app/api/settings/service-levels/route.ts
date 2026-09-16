import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { actorHasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTING_STRATEGIES = ['workload_balanced','least_open','round_robin','conversion_weighted'] as const;

const PatchSchema = z.object({
  first_response_minutes: z.number().int().min(1).max(1440),
  warning_minutes_before: z.number().int().min(0).max(1440),
  auto_reassign_on_breach: z.boolean(),
  auto_reassign_after_minutes: z.number().int().min(0).max(10080),
  auto_close_waiting_hours: z.number().int().min(0).max(720),
  next_action_reminders: z.boolean(),
  auto_assign_new_conversations: z.boolean(),
  online_only_routing: z.boolean(),
  routing_strategy: z.enum(ROUTING_STRATEGIES),
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function normalized(settings: unknown) {
  const root = record(settings);
  const sla = record(root.conversation_sla);
  const operations = record(root.conversation_operations);
  const routing = record(root.conversation_routing);
  const rawStrategy = String(routing.strategy || '');
  const strategy = ROUTING_STRATEGIES.includes(rawStrategy as (typeof ROUTING_STRATEGIES)[number])
    ? rawStrategy
    : 'workload_balanced';
  return {
    first_response_minutes: numberValue(sla.first_response_minutes, 30, 1, 1440),
    warning_minutes_before: numberValue(sla.warning_minutes_before, 10, 0, 1440),
    auto_reassign_on_breach: sla.auto_reassign_on_breach === true,
    auto_reassign_after_minutes: numberValue(sla.auto_reassign_after_minutes, 30, 0, 10080),
    auto_close_waiting_hours: numberValue(operations.auto_close_waiting_hours, 0, 0, 720),
    next_action_reminders: operations.next_action_reminders !== false,
    auto_assign_new_conversations: routing.auto_assign_new === true,
    online_only_routing: routing.online_only === true,
    routing_strategy: strategy,
  };
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'service_levels.view'))) return NextResponse.json({ error: 'Service-level settings access required.' }, { status: 403 });

  const { data, error } = await actor.supabase
    .from('workspaces')
    .select('id,name,timezone,settings')
    .eq('id', actor.profile.workspace_id)
    .single();
  if (error || !data) return NextResponse.json({ error: 'Unable to load service-level settings.' }, { status: 500 });

  return NextResponse.json({ workspace: { id: data.id, name: data.name, timezone: data.timezone }, settings: normalized(data.settings) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await actorHasPermission(actor, 'service_levels.edit'))) return NextResponse.json({ error: 'Service-level edit permission required.' }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });

  const { data: current, error: readError } = await actor.supabase
    .from('workspaces')
    .select('settings')
    .eq('id', actor.profile.workspace_id)
    .single();
  if (readError) return NextResponse.json({ error: 'Unable to load current workspace settings.' }, { status: 500 });

  const root = record(current?.settings);
  const next = {
    ...root,
    conversation_sla: {
      ...record(root.conversation_sla),
      first_response_minutes: parsed.data.first_response_minutes,
      warning_minutes_before: parsed.data.warning_minutes_before,
      auto_reassign_on_breach: parsed.data.auto_reassign_on_breach,
      auto_reassign_after_minutes: parsed.data.auto_reassign_after_minutes,
    },
    conversation_operations: {
      ...record(root.conversation_operations),
      auto_close_waiting_hours: parsed.data.auto_close_waiting_hours,
      next_action_reminders: parsed.data.next_action_reminders,
    },
    conversation_routing: {
      ...record(root.conversation_routing),
      auto_assign_new: parsed.data.auto_assign_new_conversations,
      online_only: parsed.data.online_only_routing,
      strategy: parsed.data.routing_strategy,
    },
  };

  const { error } = await actor.supabase.from('workspaces').update({ settings: next }).eq('id', actor.profile.workspace_id);
  if (error) {
    console.error('Update service-level settings failed:', error.message);
    return NextResponse.json({ error: 'Unable to update service-level settings.' }, { status: 500 });
  }
  return NextResponse.json({ settings: normalized(next) });
}

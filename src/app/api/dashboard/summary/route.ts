import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FallbackLead = {
  id: string;
  lead_code: string;
  customer_name: string;
  destination: string | null;
  stage: string;
  assigned_to: string | null;
  first_contacted_at: string | null;
  is_first_response_breached: boolean;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  package_sale_price: number | null;
  won_deal_value: number | null;
  payment_milestones: unknown;
  passengers: unknown;
  created_at: string;
};

type JsonObject = Record<string, unknown>;

type QueueItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  severity: number;
  createdAt: number;
};

function objectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function buildLegacyCompatibleSummary(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  workspaceId: string
) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const today = nowIso.slice(0, 10);
  const passportRiskCutoff = new Date(now);
  passportRiskCutoff.setUTCDate(passportRiskCutoff.getUTCDate() + 180);
  const passportRiskCutoffDate = passportRiskCutoff.toISOString().slice(0, 10);

  const [leadsResult, overdueFollowupsResult] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id,lead_code,customer_name,destination,stage,assigned_to,first_contacted_at,is_first_response_breached,next_follow_up_at,last_contacted_at,package_sale_price,won_deal_value,payment_milestones,passengers,created_at'
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5000),
    // follow_ups is a legacy child table without workspace_id. Migration 064 scopes
    // its RLS through the parent lead so this count cannot include another company.
    supabase
      .from('follow_ups')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'missed'])
      .lt('scheduled_at', nowIso),
  ]);

  if (leadsResult.error || overdueFollowupsResult.error) {
    throw new Error(leadsResult.error?.message || overdueFollowupsResult.error?.message || 'Dashboard fallback query failed.');
  }

  const leads = (leadsResult.data || []) as FallbackLead[];
  const closedStages = new Set(['won', 'lost', 'junk']);

  let slaBreaches = 0;
  let unassignedLeads = 0;
  let staleLeads = 0;
  let paymentsDue = 0;
  let passportRisks = 0;
  let myCount = 0;
  let pendingSlaCount = 0;
  let overdueCount = 0;
  let wonCount = 0;
  let wonValue = 0;

  const destinations = new Set<string>();
  const stageCounts: Record<string, number> = {};
  const queue: QueueItem[] = [];

  for (const lead of leads) {
    const isClosed = closedStages.has(lead.stage);
    const lastTouch = new Date(lead.last_contacted_at || lead.created_at).getTime();
    const isStale = !isClosed && Number.isFinite(lastTouch) && lastTouch < now - 48 * 60 * 60 * 1000;

    stageCounts[lead.stage] = (stageCounts[lead.stage] || 0) + 1;
    if (lead.destination?.trim()) destinations.add(lead.destination.trim());
    if (lead.assigned_to === userId) myCount += 1;
    if (!lead.first_contacted_at && lead.stage === 'new') pendingSlaCount += 1;
    if (lead.next_follow_up_at && new Date(lead.next_follow_up_at).getTime() < now && !isClosed) {
      overdueCount += 1;
    }

    if (lead.stage === 'won') {
      wonCount += 1;
      wonValue += Number(lead.package_sale_price ?? lead.won_deal_value ?? 0);
    }

    if (lead.is_first_response_breached) {
      slaBreaches += 1;
      queue.push({
        key: `sla-${lead.id}`,
        title: `${lead.lead_code} missed first-response SLA`,
        detail: `${lead.customer_name} · ${lead.destination || 'No destination'}`,
        href: `/leads/${lead.id}`,
        severity: 0,
        createdAt: new Date(lead.created_at).getTime(),
      });
    }

    if (!lead.assigned_to && !isClosed) {
      unassignedLeads += 1;
      queue.push({
        key: `unassigned-${lead.id}`,
        title: `${lead.lead_code} is unassigned`,
        detail: `${lead.customer_name} · ${lead.destination || 'No destination'}`,
        href: `/leads/${lead.id}`,
        severity: 1,
        createdAt: new Date(lead.created_at).getTime(),
      });
    }

    if (isStale) {
      staleLeads += 1;
      queue.push({
        key: `stale-${lead.id}`,
        title: `${lead.lead_code} has had no contact for 48+ hours`,
        detail: `${lead.customer_name} · ${lead.destination || 'No destination'}`,
        href: `/leads/${lead.id}`,
        severity: 2,
        createdAt: new Date(lead.created_at).getTime(),
      });
    }

    for (const milestone of objectArray(lead.payment_milestones)) {
      const dueDate = stringValue(milestone.due_date);
      const status = stringValue(milestone.status) || 'pending';
      if (status !== 'paid' && dueDate && dueDate <= today) paymentsDue += 1;
    }

    for (const passenger of objectArray(lead.passengers)) {
      const expiry = stringValue(passenger.passport_expiry_date);
      if (expiry && expiry < passportRiskCutoffDate) passportRisks += 1;
    }
  }

  queue.sort((a, b) => a.severity - b.severity || b.createdAt - a.createdAt);

  return {
    summary: {
      overdue_followups: overdueFollowupsResult.count || 0,
      sla_breaches: slaBreaches,
      unassigned_leads: unassignedLeads,
      stale_leads: staleLeads,
      payments_due: paymentsDue,
      passport_risks: passportRisks,
      intervention_queue: queue.slice(0, 10).map(({ severity: _severity, createdAt: _createdAt, ...item }) => item),
    },
    pipelineSummary: {
      visible_count: leads.length,
      my_count: myCount,
      pending_sla_count: pendingSlaCount,
      overdue_count: overdueCount,
      won_count: wonCount,
      won_value: wonValue,
      destinations: Array.from(destinations).sort((a, b) => a.localeCompare(b)),
      stage_counts: stageCounts,
    },
  };
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const workspaceId = actor.profile.workspace_id;
  const [operationalResult, pipelineResult] = await Promise.all([
    actor.supabase.rpc('dashboard_operational_summary'),
    actor.supabase.rpc('lead_pipeline_summary'),
  ]);

  if (!operationalResult.error && !pipelineResult.error) {
    return NextResponse.json(
      {
        summary: operationalResult.data || {},
        pipelineSummary: pipelineResult.data || {},
        isManagement: isManagement(actor.profile),
        workspaceRole: actor.profile.workspace_role,
        workspaceId,
        source: 'rpc',
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  console.warn(
    'Dashboard RPC unavailable; using legacy-compatible fallback:',
    operationalResult.error?.message || pipelineResult.error?.message
  );

  try {
    const fallback = await buildLegacyCompatibleSummary(actor.supabase, actor.user.id, workspaceId);
    return NextResponse.json(
      {
        ...fallback,
        isManagement: isManagement(actor.profile),
        workspaceRole: actor.profile.workspace_role,
        workspaceId,
        source: 'fallback',
        migrationRequired: true,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (fallbackError) {
    console.error(
      'Dashboard summary failed:',
      operationalResult.error?.message || pipelineResult.error?.message,
      fallbackError instanceof Error ? fallbackError.message : fallbackError
    );
    return NextResponse.json({ error: 'Unable to load Action Center.' }, { status: 500 });
  }
}

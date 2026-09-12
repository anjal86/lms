import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Settings = {
  overdue_grace_minutes?: number;
  escalate_to_manager?: boolean;
  auto_reassign_breached_leads?: boolean;
  auto_reassign_hours?: number;
};

function secretsEqual(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function numberSetting(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SLA_CRON_SECRET;
  if (!secret || secret.length < 32) {
    console.error('SLA_CRON_SECRET is missing or too short.');
    return NextResponse.json({ error: 'SLA worker is not configured.' }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const prefix = 'Bearer ';
  const received = authHeader.startsWith(prefix) ? authHeader.slice(prefix.length) : '';
  if (!received || !secretsEqual(received, secret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: settingsRow, error: settingsError } = await admin
    .from('agency_settings')
    .select('settings')
    .eq('id', 'default')
    .maybeSingle();
  if (settingsError) {
    console.error('SLA settings lookup failed:', settingsError.message);
    return NextResponse.json({ error: 'Unable to load SLA settings.' }, { status: 500 });
  }

  const settings = (settingsRow?.settings || {}) as Settings;
  const graceMinutes = numberSetting(settings.overdue_grace_minutes, 60, 0, 10080);
  const reassignHours = numberSetting(settings.auto_reassign_hours, 4, 0, 168);
  const escalate = settings.escalate_to_manager !== false;
  const autoReassign = settings.auto_reassign_breached_leads === true;

  const { data: managers, error: managersError } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'manager'])
    .eq('is_active', true);
  if (managersError) {
    console.error('SLA manager lookup failed:', managersError.message);
    return NextResponse.json({ error: 'Unable to load escalation recipients.' }, { status: 500 });
  }
  const managerIds = (managers || []).map((profile) => profile.id);

  let breached = 0;
  let reassigned = 0;
  let missedFollowUps = 0;

  const { data: dueLeads, error: dueLeadsError } = await admin
    .from('leads')
    .select('id,lead_code,customer_name,destination,assigned_to,first_response_due_at')
    .not('assigned_to', 'is', null)
    .is('first_contacted_at', null)
    .eq('is_first_response_breached', false)
    .in('stage', ['new', 'contacted', 'quote_sent', 'in_negotiation'])
    .lt('first_response_due_at', nowIso)
    .limit(500);

  if (dueLeadsError) {
    console.error('SLA lead lookup failed:', dueLeadsError.message);
    return NextResponse.json({ error: 'Unable to process SLA leads.' }, { status: 500 });
  }

  for (const lead of dueLeads || []) {
    const { data: changed, error: breachError } = await admin
      .from('leads')
      .update({ is_first_response_breached: true })
      .eq('id', lead.id)
      .eq('is_first_response_breached', false)
      .is('first_contacted_at', null)
      .select('id')
      .maybeSingle();

    if (breachError) {
      console.error(`SLA breach update failed for ${lead.id}:`, breachError.message);
      continue;
    }
    if (!changed) continue;
    breached += 1;

    const notifications = [
      ...(lead.assigned_to
        ? [{
            user_id: lead.assigned_to,
            title: 'First-response SLA breached',
            message: `${lead.lead_code || 'Lead'} · ${lead.customer_name} requires immediate attention.`,
            type: 'sla_breach',
            link: `/leads/${lead.id}`,
          }]
        : []),
      ...(escalate
        ? managerIds
            .filter((id) => id !== lead.assigned_to)
            .map((id) => ({
              user_id: id,
              title: 'Lead SLA escalation',
              message: `${lead.lead_code || 'Lead'} · ${lead.customer_name} missed its first-response SLA.`,
              type: 'sla_breach',
              link: `/leads/${lead.id}`,
            }))
        : []),
    ];

    if (notifications.length) {
      const { error } = await admin.from('notifications').insert(notifications);
      if (error) console.error(`SLA notification insert failed for ${lead.id}:`, error.message);
    }

    const { error: activityError } = await admin.from('activity_logs').insert({
      lead_id: lead.id,
      agent_id: lead.assigned_to,
      activity_type: 'sla_alert',
      title: 'First-response SLA breached',
      notes: 'Automatically detected by the server-side SLA worker.',
      metadata: { first_response_due_at: lead.first_response_due_at },
    });
    if (activityError) console.error(`SLA activity insert failed for ${lead.id}:`, activityError.message);

    if (!autoReassign || !lead.assigned_to || !lead.first_response_due_at) continue;
    const dueAt = new Date(lead.first_response_due_at).getTime();
    if (!Number.isFinite(dueAt) || now.getTime() - dueAt < reassignHours * 60 * 60 * 1000) continue;

    const { data: replacement, error: routeError } = await admin.rpc('route_lead_atomic', {
      p_lead_id: lead.id,
      p_destination: lead.destination,
      p_excluded_agent: lead.assigned_to,
      p_force: true,
    });
    if (routeError) {
      console.error(`SLA reassignment failed for ${lead.id}:`, routeError.message);
      continue;
    }
    if (!replacement) continue;
    reassigned += 1;

    const [activityResult, notificationResult] = await Promise.all([
      admin.from('activity_logs').insert({
        lead_id: lead.id,
        agent_id: replacement,
        activity_type: 'reassignment',
        title: 'Lead automatically reassigned after SLA breach',
        notes: 'The previous owner exceeded the configured reassignment window.',
        metadata: { previous_agent_id: lead.assigned_to, new_agent_id: replacement },
      }),
      admin.from('notifications').insert({
        user_id: replacement,
        title: 'SLA recovery lead assigned',
        message: `${lead.lead_code || 'Lead'} · ${lead.customer_name} has been reassigned to you.`,
        type: 'reassignment',
        link: `/leads/${lead.id}`,
      }),
    ]);
    if (activityResult.error) console.error(`Reassignment activity failed for ${lead.id}:`, activityResult.error.message);
    if (notificationResult.error) console.error(`Reassignment notification failed for ${lead.id}:`, notificationResult.error.message);
  }

  const followUpCutoff = new Date(now.getTime() - graceMinutes * 60 * 1000).toISOString();
  const { data: dueFollowUps, error: followUpError } = await admin
    .from('follow_ups')
    .select('id,lead_id,assigned_to,title,scheduled_at')
    .eq('status', 'pending')
    .lt('scheduled_at', followUpCutoff)
    .limit(500);

  if (followUpError) {
    console.error('Follow-up SLA lookup failed:', followUpError.message);
  } else {
    for (const followUp of dueFollowUps || []) {
      const { data: changed, error } = await admin
        .from('follow_ups')
        .update({
          status: 'missed',
          is_escalated: escalate,
          escalated_at: escalate ? nowIso : null,
        })
        .eq('id', followUp.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (error || !changed) continue;
      missedFollowUps += 1;

      const recipients = new Set<string>([followUp.assigned_to, ...(escalate ? managerIds : [])]);
      const rows = [...recipients].map((userId) => ({
        user_id: userId,
        title: userId === followUp.assigned_to ? 'Follow-up missed' : 'Follow-up escalation',
        message: `${followUp.title} was not completed within the configured grace period.`,
        type: 'follow_up_due',
        link: `/leads/${followUp.lead_id}`,
      }));
      if (rows.length) {
        const { error: notificationError } = await admin.from('notifications').insert(rows);
        if (notificationError) console.error(`Follow-up notification failed for ${followUp.id}:`, notificationError.message);
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed_at: nowIso,
    breached,
    reassigned,
    missed_follow_ups: missedFollowUps,
  });
}

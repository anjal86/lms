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

type WorkspaceSettings = {
  conversation_sla?: {
    warning_minutes_before?: number;
    auto_reassign_on_breach?: boolean;
    auto_reassign_after_minutes?: number;
  };
  conversation_operations?: {
    auto_close_waiting_hours?: number;
    next_action_reminders?: boolean;
  };
};

type NotificationRow = {
  user_id: string;
  title: string;
  message: string;
  type: string;
  link: string;
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
    .select('id,workspace_id')
    .in('role', ['admin', 'manager'])
    .eq('is_active', true);
  if (managersError) {
    console.error('SLA manager lookup failed:', managersError.message);
    return NextResponse.json({ error: 'Unable to load escalation recipients.' }, { status: 500 });
  }
  const managersByWorkspace = new Map<string, string[]>();
  for (const profile of managers || []) {
    if (!profile.workspace_id) continue;
    managersByWorkspace.set(profile.workspace_id, [...(managersByWorkspace.get(profile.workspace_id) || []), profile.id]);
  }

  async function insertNotifications(rows: NotificationRow[], context: string) {
    if (!rows.length) return;
    const { error } = await admin.from('notifications').insert(rows);
    if (error) console.error(`${context} notification insert failed:`, error.message);
  }

  let breached = 0;
  let reassigned = 0;
  let missedFollowUps = 0;
  let conversationsWoken = 0;
  let conversationWarnings = 0;
  let conversationBreaches = 0;
  let conversationReassignments = 0;
  let conversationReminders = 0;
  let conversationsAutoClosed = 0;

  // -----------------------------------------------------------------------
  // Existing CRM lead SLA processing, now workspace-aware for escalation.
  // -----------------------------------------------------------------------
  const { data: dueLeads, error: dueLeadsError } = await admin
    .from('leads')
    .select('id,workspace_id,lead_code,customer_name,destination,assigned_to,first_response_due_at')
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

    const managerIds = lead.workspace_id ? (managersByWorkspace.get(lead.workspace_id) || []) : [];
    const notifications: NotificationRow[] = [
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
    await insertNotifications(notifications, `Lead ${lead.id}`);

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

  // -----------------------------------------------------------------------
  // Conversation operations: deadlines advance independently of Inbox reads.
  // -----------------------------------------------------------------------
  const { data: workspaces, error: workspacesError } = await admin
    .from('workspaces')
    .select('id,settings');

  if (workspacesError) {
    console.error('Conversation workspace settings lookup failed:', workspacesError.message);
  } else {
    for (const workspace of workspaces || []) {
      const workspaceSettings = (workspace.settings || {}) as WorkspaceSettings;
      const conversationSla = workspaceSettings.conversation_sla || {};
      const conversationOperations = workspaceSettings.conversation_operations || {};
      const warningMinutes = numberSetting(conversationSla.warning_minutes_before, 10, 0, 1440);
      const conversationReassignAfter = numberSetting(conversationSla.auto_reassign_after_minutes, 30, 0, 10080);
      const shouldReassign = conversationSla.auto_reassign_on_breach === true;
      const autoCloseHours = numberSetting(conversationOperations.auto_close_waiting_hours, 0, 0, 720);
      const shouldRemindNextAction = conversationOperations.next_action_reminders !== false;
      const workspaceManagerIds = managersByWorkspace.get(workspace.id) || [];

      const { data: woken, error: wakeError } = await admin
        .from('lead_conversations')
        .update({ workflow_state: 'open', status: 'open', snoozed_until: null, updated_at: nowIso })
        .eq('workspace_id', workspace.id)
        .eq('workflow_state', 'snoozed')
        .lte('snoozed_until', nowIso)
        .select('id,contact_id');
      if (wakeError) {
        console.error(`Conversation wake failed for workspace ${workspace.id}:`, wakeError.message);
      } else {
        conversationsWoken += woken?.length || 0;
        if (woken?.length) {
          const { error } = await admin.from('conversation_events').insert(woken.map((conversation) => ({
            workspace_id: workspace.id,
            conversation_id: conversation.id,
            contact_id: conversation.contact_id,
            event_type: 'state_changed',
            actor_id: null,
            payload: { to: 'open', worker_source: 'snooze_expired' },
          })));
          if (error) console.error(`Conversation wake events failed for workspace ${workspace.id}:`, error.message);
        }
      }

      if (warningMinutes > 0) {
        const warningCutoff = new Date(now.getTime() + warningMinutes * 60 * 1000).toISOString();
        const { data: warningRows, error: warningError } = await admin
          .from('lead_conversations')
          .select('id,customer_name,assigned_to,first_response_due_at')
          .eq('workspace_id', workspace.id)
          .neq('workflow_state', 'closed')
          .is('first_responded_at', null)
          .is('sla_warning_sent_at', null)
          .gt('first_response_due_at', nowIso)
          .lte('first_response_due_at', warningCutoff)
          .limit(500);
        if (warningError) {
          console.error(`Conversation SLA warning lookup failed for workspace ${workspace.id}:`, warningError.message);
        } else {
          for (const conversation of warningRows || []) {
            const { data: changed } = await admin
              .from('lead_conversations')
              .update({ sla_warning_sent_at: nowIso })
              .eq('id', conversation.id)
              .is('sla_warning_sent_at', null)
              .is('first_responded_at', null)
              .select('id')
              .maybeSingle();
            if (!changed) continue;
            conversationWarnings += 1;
            if (conversation.assigned_to) {
              await insertNotifications([{
                user_id: conversation.assigned_to,
                title: 'Conversation SLA approaching',
                message: `${conversation.customer_name || 'Customer'} needs a first response soon.`,
                type: 'sla_warning',
                link: `/inbox?conversationId=${conversation.id}`,
              }], `Conversation warning ${conversation.id}`);
            }
          }
        }
      }

      const { data: breachedRows, error: breachedError } = await admin
        .from('lead_conversations')
        .select('id,customer_name,assigned_to,first_response_due_at')
        .eq('workspace_id', workspace.id)
        .neq('workflow_state', 'closed')
        .is('first_responded_at', null)
        .is('sla_breached_at', null)
        .lt('first_response_due_at', nowIso)
        .limit(500);
      if (breachedError) {
        console.error(`Conversation SLA breach lookup failed for workspace ${workspace.id}:`, breachedError.message);
      } else {
        for (const conversation of breachedRows || []) {
          const { data: changed } = await admin
            .from('lead_conversations')
            .update({ sla_breached_at: nowIso })
            .eq('id', conversation.id)
            .is('sla_breached_at', null)
            .is('first_responded_at', null)
            .select('id')
            .maybeSingle();
          if (!changed) continue;
          conversationBreaches += 1;

          const breachRecipients = new Set<string>();
          if (conversation.assigned_to) breachRecipients.add(conversation.assigned_to);
          for (const managerId of workspaceManagerIds) breachRecipients.add(managerId);
          await insertNotifications([...breachRecipients].map((userId) => ({
            user_id: userId,
            title: userId === conversation.assigned_to ? 'Conversation SLA breached' : 'Conversation SLA escalation',
            message: `${conversation.customer_name || 'Customer'} has not received a first response in time.`,
            type: 'sla_breach',
            link: `/inbox?conversationId=${conversation.id}`,
          })), `Conversation breach ${conversation.id}`);

          if (shouldReassign && conversation.assigned_to && conversation.first_response_due_at) {
            const dueAt = new Date(conversation.first_response_due_at).getTime();
            if (Number.isFinite(dueAt) && now.getTime() - dueAt >= conversationReassignAfter * 60 * 1000) {
              const { data: replacement, error: assignmentError } = await admin.rpc('assign_conversation_worker', {
                p_conversation_id: conversation.id,
                p_strategy: null,
              });
              if (assignmentError) {
                console.error(`Conversation SLA reassignment failed for ${conversation.id}:`, assignmentError.message);
              } else if (replacement) {
                conversationReassignments += 1;
                await insertNotifications([{
                  user_id: replacement,
                  title: 'SLA recovery conversation assigned',
                  message: `${conversation.customer_name || 'Customer'} was reassigned to you after an SLA breach.`,
                  type: 'reassignment',
                  link: `/inbox?conversationId=${conversation.id}`,
                }], `Conversation reassignment ${conversation.id}`);
              }
            }
          }
        }
      }

      if (shouldRemindNextAction) {
        const { data: reminders, error: reminderError } = await admin
          .from('lead_conversations')
          .select('id,customer_name,assigned_to,next_action_at')
          .eq('workspace_id', workspace.id)
          .neq('workflow_state', 'closed')
          .not('next_action_at', 'is', null)
          .is('next_action_notified_at', null)
          .lte('next_action_at', nowIso)
          .limit(500);
        if (reminderError) {
          console.error(`Conversation next-action lookup failed for workspace ${workspace.id}:`, reminderError.message);
        } else {
          for (const conversation of reminders || []) {
            const { data: changed } = await admin
              .from('lead_conversations')
              .update({ next_action_notified_at: nowIso })
              .eq('id', conversation.id)
              .is('next_action_notified_at', null)
              .select('id')
              .maybeSingle();
            if (!changed) continue;
            conversationReminders += 1;
            if (conversation.assigned_to) {
              await insertNotifications([{
                user_id: conversation.assigned_to,
                title: 'Conversation next action due',
                message: `${conversation.customer_name || 'Customer'} is ready for the next follow-up action.`,
                type: 'follow_up_due',
                link: `/inbox?conversationId=${conversation.id}`,
              }], `Conversation reminder ${conversation.id}`);
            }
          }
        }
      }

      if (autoCloseHours > 0) {
        const autoCloseCutoff = new Date(now.getTime() - autoCloseHours * 60 * 60 * 1000).toISOString();
        const { data: staleWaiting, error: staleError } = await admin
          .from('lead_conversations')
          .select('id,contact_id,customer_name')
          .eq('workspace_id', workspace.id)
          .eq('workflow_state', 'waiting')
          .eq('needs_reply', false)
          .lt('last_message_at', autoCloseCutoff)
          .limit(500);
        if (staleError) {
          console.error(`Conversation auto-close lookup failed for workspace ${workspace.id}:`, staleError.message);
        } else {
          for (const conversation of staleWaiting || []) {
            const { data: changed, error: closeError } = await admin
              .from('lead_conversations')
              .update({
                workflow_state: 'closed',
                status: 'closed',
                closed_at: nowIso,
                closed_by: null,
                resolution_code: 'no_reply_timeout',
                closing_note: `Automatically resolved after ${autoCloseHours} hours without a customer reply.`,
                auto_closed_at: nowIso,
                needs_reply: false,
                updated_at: nowIso,
              })
              .eq('id', conversation.id)
              .eq('workflow_state', 'waiting')
              .select('id')
              .maybeSingle();
            if (closeError || !changed) continue;
            conversationsAutoClosed += 1;
            const { error } = await admin.from('conversation_events').insert({
              workspace_id: workspace.id,
              conversation_id: conversation.id,
              contact_id: conversation.contact_id,
              event_type: 'state_changed',
              actor_id: null,
              payload: { to: 'closed', resolution_code: 'no_reply_timeout', worker_source: 'auto_close' },
            });
            if (error) console.error(`Conversation auto-close event failed for ${conversation.id}:`, error.message);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Existing follow-up deadline processing.
  // -----------------------------------------------------------------------
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

      const { data: followUpLead } = await admin.from('leads').select('workspace_id').eq('id', followUp.lead_id).maybeSingle();
      const managerIds = followUpLead?.workspace_id ? (managersByWorkspace.get(followUpLead.workspace_id) || []) : [];
      const recipients = new Set<string>([followUp.assigned_to, ...(escalate ? managerIds : [])].filter(Boolean));
      const rows: NotificationRow[] = [...recipients].map((userId) => ({
        user_id: userId,
        title: userId === followUp.assigned_to ? 'Follow-up missed' : 'Follow-up escalation',
        message: `${followUp.title} was not completed within the configured grace period.`,
        type: 'follow_up_due',
        link: `/leads/${followUp.lead_id}`,
      }));
      await insertNotifications(rows, `Follow-up ${followUp.id}`);
    }
  }

  return NextResponse.json({
    success: true,
    processed_at: nowIso,
    breached,
    reassigned,
    missed_follow_ups: missedFollowUps,
    conversations: {
      woken: conversationsWoken,
      warnings: conversationWarnings,
      breached: conversationBreaches,
      reassigned: conversationReassignments,
      reminders: conversationReminders,
      auto_closed: conversationsAutoClosed,
    },
  });
}

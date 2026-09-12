-- Server-side aggregate queries used by the paginated pipeline and Action Center.
-- SECURITY INVOKER is deliberate: all aggregates remain constrained by RLS.

create or replace function public.lead_pipeline_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select * from public.leads
  ), metrics as (
    select
      count(*)::integer as visible_count,
      count(*) filter (where assigned_to = auth.uid())::integer as my_count,
      count(*) filter (
        where first_contacted_at is null and stage = 'new'
      )::integer as pending_sla_count,
      count(*) filter (
        where next_follow_up_at is not null
          and next_follow_up_at < now()
          and stage not in ('won','lost','junk')
      )::integer as overdue_count,
      count(*) filter (where stage = 'won')::integer as won_count,
      coalesce(sum(coalesce(package_sale_price, won_deal_value, 0)) filter (where stage = 'won'), 0)::numeric as won_value
    from visible
  ), destinations as (
    select coalesce(jsonb_agg(destination order by destination), '[]'::jsonb) as values
    from (
      select distinct destination
      from visible
      where destination is not null and btrim(destination) <> ''
      order by destination
    ) d
  ), stages as (
    select coalesce(jsonb_object_agg(stage, count_value), '{}'::jsonb) as values
    from (
      select stage, count(*)::integer as count_value
      from visible
      group by stage
    ) s
  )
  select jsonb_build_object(
    'visible_count', metrics.visible_count,
    'my_count', metrics.my_count,
    'pending_sla_count', metrics.pending_sla_count,
    'overdue_count', metrics.overdue_count,
    'won_count', metrics.won_count,
    'won_value', metrics.won_value,
    'destinations', destinations.values,
    'stage_counts', stages.values
  )
  from metrics cross join destinations cross join stages;
$$;

revoke all on function public.lead_pipeline_summary() from public;
grant execute on function public.lead_pipeline_summary() to authenticated;

create or replace function public.dashboard_operational_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_leads as (
    select * from public.leads
  ), overdue_followups as (
    select count(*)::integer as value
    from public.follow_ups
    where status in ('pending','missed') and scheduled_at < now()
  ), lead_metrics as (
    select
      count(*) filter (where is_first_response_breached = true)::integer as breached,
      count(*) filter (
        where assigned_to is null and stage not in ('won','lost','junk')
      )::integer as unassigned,
      count(*) filter (
        where stage not in ('won','lost','junk')
          and coalesce(last_contacted_at, created_at) < now() - interval '48 hours'
      )::integer as stale
    from visible_leads
  ), due_payments as (
    select count(*)::integer as value
    from public.lead_payment_milestones m
    where public.can_access_lead(m.lead_id)
      and coalesce(m.status,'pending') <> 'paid'
      and m.due_date is not null
      and m.due_date <= current_date
  ), passport_risks as (
    select count(*)::integer as value
    from public.lead_passengers p
    where public.can_access_lead(p.lead_id)
      and p.passport_expiry_date is not null
      and p.passport_expiry_date < current_date + 180
  ), queue as (
    select coalesce(jsonb_agg(to_jsonb(q) - 'severity' order by q.severity, q.created_at desc), '[]'::jsonb) as items
    from (
      select
        ('sla-' || l.id::text) as key,
        (l.lead_code || ' missed first-response SLA') as title,
        (l.customer_name || ' · ' || l.destination) as detail,
        ('/leads/' || l.id::text) as href,
        0 as severity,
        l.created_at
      from visible_leads l
      where l.is_first_response_breached = true

      union all

      select
        ('unassigned-' || l.id::text),
        (l.lead_code || ' is unassigned'),
        (l.customer_name || ' · ' || l.destination),
        ('/leads/' || l.id::text),
        1,
        l.created_at
      from visible_leads l
      where l.assigned_to is null and l.stage not in ('won','lost','junk')

      union all

      select
        ('stale-' || l.id::text),
        (l.lead_code || ' has had no contact for 48+ hours'),
        (l.customer_name || ' · ' || l.destination),
        ('/leads/' || l.id::text),
        2,
        l.created_at
      from visible_leads l
      where l.stage not in ('won','lost','junk')
        and coalesce(l.last_contacted_at, l.created_at) < now() - interval '48 hours'
      order by 5, 6 desc
      limit 10
    ) q
  )
  select jsonb_build_object(
    'overdue_followups', overdue_followups.value,
    'sla_breaches', lead_metrics.breached,
    'unassigned_leads', lead_metrics.unassigned,
    'stale_leads', lead_metrics.stale,
    'payments_due', due_payments.value,
    'passport_risks', passport_risks.value,
    'intervention_queue', queue.items
  )
  from overdue_followups
  cross join lead_metrics
  cross join due_payments
  cross join passport_risks
  cross join queue;
$$;

revoke all on function public.dashboard_operational_summary() from public;
grant execute on function public.dashboard_operational_summary() to authenticated;

comment on function public.lead_pipeline_summary() is 'RLS-aware aggregate metrics for the lead pipeline.';
comment on function public.dashboard_operational_summary() is 'RLS-aware Action Center counts and prioritized intervention items.';

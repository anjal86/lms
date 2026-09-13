-- 202609120029_pipeline_legacy_stage_sync.sql
-- Keep the legacy leads.stage compatibility field aligned with the adaptive
-- pipeline stage. Older reports and filters still read leads.stage while
-- adaptive workspaces use pipeline_stage_id as the source of truth.

begin;

create or replace function public.sync_lead_legacy_stage_from_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_key text;
  v_stage_type text;
begin
  if new.pipeline_stage_id is null then
    return new;
  end if;

  select ps.stage_key, ps.stage_type
    into v_stage_key, v_stage_type
  from public.pipeline_stages ps
  join public.pipelines p on p.id = ps.pipeline_id
  where ps.id = new.pipeline_stage_id
    and p.workspace_id = new.workspace_id
    and (new.pipeline_id is null or p.id = new.pipeline_id);

  if found then
    new.stage := case
      when v_stage_type = 'won' then 'won'
      when v_stage_type = 'lost' and v_stage_key = 'junk' then 'junk'
      when v_stage_type = 'lost' then 'lost'
      when v_stage_key in ('new', 'contacted', 'quote_sent', 'in_negotiation') then v_stage_key
      else 'new'
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_lead_legacy_stage_from_pipeline() from public, anon, authenticated;

drop trigger if exists trg_sync_lead_legacy_stage_from_pipeline on public.leads;
create trigger trg_sync_lead_legacy_stage_from_pipeline
before insert or update of pipeline_stage_id, pipeline_id, workspace_id
on public.leads
for each row
execute function public.sync_lead_legacy_stage_from_pipeline();

create or replace function public.sync_pipeline_stage_legacy_leads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legacy_stage text;
begin
  v_legacy_stage := case
    when new.stage_type = 'won' then 'won'
    when new.stage_type = 'lost' and new.stage_key = 'junk' then 'junk'
    when new.stage_type = 'lost' then 'lost'
    when new.stage_key in ('new', 'contacted', 'quote_sent', 'in_negotiation') then new.stage_key
    else 'new'
  end;

  update public.leads
  set stage = v_legacy_stage,
      updated_at = now()
  where pipeline_stage_id = new.id
    and stage is distinct from v_legacy_stage;

  return new;
end;
$$;

revoke all on function public.sync_pipeline_stage_legacy_leads() from public, anon, authenticated;

drop trigger if exists trg_sync_pipeline_stage_legacy_leads on public.pipeline_stages;
create trigger trg_sync_pipeline_stage_legacy_leads
after update of stage_key, stage_type
on public.pipeline_stages
for each row
when (old.stage_key is distinct from new.stage_key or old.stage_type is distinct from new.stage_type)
execute function public.sync_pipeline_stage_legacy_leads();

-- Repair rows created or moved before these triggers existed.
update public.leads l
set stage = case
      when ps.stage_type = 'won' then 'won'
      when ps.stage_type = 'lost' and ps.stage_key = 'junk' then 'junk'
      when ps.stage_type = 'lost' then 'lost'
      when ps.stage_key in ('new', 'contacted', 'quote_sent', 'in_negotiation') then ps.stage_key
      else 'new'
    end,
    updated_at = now()
from public.pipeline_stages ps
join public.pipelines p on p.id = ps.pipeline_id
where l.pipeline_stage_id = ps.id
  and l.pipeline_id = p.id
  and l.workspace_id = p.workspace_id
  and l.stage is distinct from case
      when ps.stage_type = 'won' then 'won'
      when ps.stage_type = 'lost' and ps.stage_key = 'junk' then 'junk'
      when ps.stage_type = 'lost' then 'lost'
      when ps.stage_key in ('new', 'contacted', 'quote_sent', 'in_negotiation') then ps.stage_key
      else 'new'
    end;

commit;

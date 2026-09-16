-- Assist mode exists specifically to help a human owner, so it must be allowed to
-- create drafts even when normal conversation routing has already assigned staff.

begin;

update public.ai_agents
set allow_when_human_assigned = true,
    updated_at = now()
where mode = 'assist'
  and allow_when_human_assigned = false;

create or replace function public.normalize_ai_agent_mode_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.mode = 'assist' then
    new.allow_when_human_assigned := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_ai_agent_mode_settings on public.ai_agents;
create trigger trg_normalize_ai_agent_mode_settings
before insert or update of mode,allow_when_human_assigned on public.ai_agents
for each row execute function public.normalize_ai_agent_mode_settings();

commit;

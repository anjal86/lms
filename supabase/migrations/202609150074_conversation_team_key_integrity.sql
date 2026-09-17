-- Conversation team keys are persisted on lead_conversations and automation rules.
-- Once created, a key must remain stable so historical and active routing references cannot drift.

begin;

create or replace function public.save_conversation_team(
  p_team_id uuid,
  p_name text,
  p_team_key text,
  p_description text default null,
  p_is_active boolean default true,
  p_member_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := public.current_workspace_id();
  v_team_id uuid := p_team_id;
  v_team_key text := lower(regexp_replace(btrim(coalesce(p_team_key,'')), '[^a-zA-Z0-9_-]+', '_', 'g'));
  v_existing_key text;
  v_user_id uuid;
begin
  if v_workspace_id is null or not public.is_management() then
    raise exception 'Manager access required' using errcode='42501';
  end if;
  if nullif(btrim(p_name),'') is null then
    raise exception 'Team name is required' using errcode='22023';
  end if;
  if nullif(v_team_key,'') is null then
    raise exception 'Team key is required' using errcode='22023';
  end if;

  if v_team_id is null then
    insert into public.conversation_teams(workspace_id,team_key,name,description,is_active,updated_at)
    values (v_workspace_id,v_team_key,btrim(p_name),nullif(btrim(p_description),''),coalesce(p_is_active,true),now())
    returning id into v_team_id;
  else
    select team_key into v_existing_key
    from public.conversation_teams
    where id=v_team_id and workspace_id=v_workspace_id
    for update;

    if not found then
      raise exception 'Conversation team not found' using errcode='P0002';
    end if;

    if v_existing_key is distinct from v_team_key then
      raise exception 'Team key cannot be changed after creation' using errcode='22023';
    end if;

    update public.conversation_teams
    set name=btrim(p_name),
        description=nullif(btrim(p_description),''),
        is_active=coalesce(p_is_active,true),
        updated_at=now()
    where id=v_team_id and workspace_id=v_workspace_id;
  end if;

  delete from public.conversation_team_members
  where team_id=v_team_id and workspace_id=v_workspace_id;

  foreach v_user_id in array coalesce(p_member_ids,'{}'::uuid[]) loop
    insert into public.conversation_team_members(team_id,workspace_id,user_id,is_active)
    values (v_team_id,v_workspace_id,v_user_id,true)
    on conflict (team_id,user_id) do update set is_active=true;
  end loop;

  return v_team_id;
end;
$$;

revoke all on function public.save_conversation_team(uuid,text,text,text,boolean,uuid[]) from public, anon;
grant execute on function public.save_conversation_team(uuid,text,text,text,boolean,uuid[]) to authenticated, service_role;

commit;

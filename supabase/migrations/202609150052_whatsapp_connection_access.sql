-- 202609150052_whatsapp_connection_access.sql
-- Personal WhatsApp accounts must not leak across staff users in the same workspace.

begin;

create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lead_conversations c
    left join public.integration_connections ic on ic.id = c.connection_id
    where c.id = p_conversation_id
      and public.current_user_active()
      and c.workspace_id = public.current_workspace_id()
      and (
        public.is_management()
        or (
          (
            c.provider <> 'whatsapp'
            or (
              ic.id is not null
              and ic.workspace_id = c.workspace_id
              and (ic.visibility_scope = 'workspace' or ic.connected_by = auth.uid())
            )
          )
          and (
            c.assigned_to = auth.uid()
            or c.assigned_to is null
            or exists (
              select 1
              from public.conversation_collaborators cc
              where cc.conversation_id = c.id
                and cc.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

revoke all on function public.can_access_conversation(uuid) from public, anon;
grant execute on function public.can_access_conversation(uuid) to authenticated, service_role;

drop policy if exists integration_connections_read on public.integration_connections;
create policy integration_connections_read on public.integration_connections
  for select to authenticated
  using (
    public.current_user_active()
    and workspace_id = public.current_workspace_id()
    and (
      provider <> 'whatsapp'
      or public.is_management()
      or visibility_scope = 'workspace'
      or connected_by = auth.uid()
    )
  );

drop policy if exists lead_conversations_read on public.lead_conversations;
create policy lead_conversations_read on public.lead_conversations
  for select to authenticated
  using (public.can_access_conversation(id));

drop policy if exists lead_conversations_write on public.lead_conversations;
create policy lead_conversations_write on public.lead_conversations
  for all to authenticated
  using (public.can_access_conversation(id))
  with check (
    public.current_user_active()
    and workspace_id = public.current_workspace_id()
    and (
      public.is_management()
      or assigned_to = auth.uid()
      or assigned_to is null
    )
    and (
      provider <> 'whatsapp'
      or exists (
        select 1
        from public.integration_connections ic
        where ic.id = connection_id
          and ic.workspace_id = workspace_id
          and (ic.visibility_scope = 'workspace' or ic.connected_by = auth.uid())
      )
    )
  );

-- lead_messages policies already delegate to can_access_conversation(conversation_id),
-- so replacing the function above applies the new boundary to message reads/writes too.

commit;

-- 202609150064_workspace_tenant_data_integrity.sql
-- Close legacy tenant gaps exposed by multi-company workspace roles.
-- Several pre-workspace helpers were SECURITY DEFINER and only checked assignment/role,
-- which meant a manager in the active workspace could pass access checks for a lead in
-- another workspace when a child table called can_access_lead(). Follow-up/activity RLS
-- also predated workspaces and therefore relied on role alone.

begin;

create or replace function public.can_access_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active()
    and public.current_workspace_id() is not null
    and exists (
      select 1
      from public.leads l
      where l.id = p_lead_id
        and l.workspace_id = public.current_workspace_id()
        and (
          public.is_management()
          or l.assigned_to = auth.uid()
          or l.assigned_to is null
        )
    );
$$;

create or replace function public.can_manage_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active()
    and public.current_workspace_id() is not null
    and exists (
      select 1
      from public.leads l
      where l.id = p_lead_id
        and l.workspace_id = public.current_workspace_id()
        and (
          public.is_management()
          or l.assigned_to = auth.uid()
        )
    );
$$;

revoke all on function public.can_access_lead(uuid) from public;
revoke all on function public.can_manage_lead(uuid) from public;
grant execute on function public.can_access_lead(uuid) to authenticated;
grant execute on function public.can_manage_lead(uuid) to authenticated;

-- follow_ups does not have its own workspace_id, so the parent lead is the tenant
-- boundary. Preserve the old agent semantics while requiring that parent to be in the
-- currently selected workspace.
drop policy if exists "followups_select_scoped" on public.follow_ups;
create policy "followups_select_scoped" on public.follow_ups
  for select to authenticated
  using (
    public.current_user_active()
    and public.can_access_lead(lead_id)
    and (public.is_management() or assigned_to = auth.uid())
  );

drop policy if exists "followups_insert_scoped" on public.follow_ups;
create policy "followups_insert_scoped" on public.follow_ups
  for insert to authenticated
  with check (
    public.current_user_active()
    and public.can_manage_lead(lead_id)
    and (public.is_management() or assigned_to = auth.uid())
  );

drop policy if exists "followups_update_scoped" on public.follow_ups;
create policy "followups_update_scoped" on public.follow_ups
  for update to authenticated
  using (
    public.current_user_active()
    and public.can_manage_lead(lead_id)
    and (public.is_management() or assigned_to = auth.uid())
  )
  with check (
    public.current_user_active()
    and public.can_manage_lead(lead_id)
    and (public.is_management() or assigned_to = auth.uid())
  );

drop policy if exists "followups_delete_scoped" on public.follow_ups;
create policy "followups_delete_scoped" on public.follow_ups
  for delete to authenticated
  using (
    public.current_user_active()
    and public.can_manage_lead(lead_id)
    and (public.is_management() or assigned_to = auth.uid())
  );

-- Activity rows are also legacy lead children without workspace_id. Lead-linked rows
-- inherit the active workspace from their parent; unlinked rows are only visible to the
-- user who owns them because there is no safe tenant identity to infer otherwise.
drop policy if exists "activity_select_scoped" on public.activity_logs;
create policy "activity_select_scoped" on public.activity_logs
  for select to authenticated
  using (
    public.current_user_active()
    and (
      (lead_id is not null and public.can_access_lead(lead_id))
      or (lead_id is null and agent_id = auth.uid())
    )
  );

drop policy if exists "activity_insert_scoped" on public.activity_logs;
create policy "activity_insert_scoped" on public.activity_logs
  for insert to authenticated
  with check (
    public.current_user_active()
    and agent_id = auth.uid()
    and (
      lead_id is null
      or public.can_manage_lead(lead_id)
    )
  );

-- These indexes make the workspace predicate added above cheap for the SECURITY DEFINER
-- helpers and for dashboard child-table aggregation.
create index if not exists leads_workspace_id_id_idx
  on public.leads(workspace_id, id);
create index if not exists follow_ups_lead_status_scheduled_idx
  on public.follow_ups(lead_id, status, scheduled_at);

comment on function public.can_access_lead(uuid) is
  'Tenant-safe lead access helper: the lead must belong to the current active workspace.';
comment on function public.can_manage_lead(uuid) is
  'Tenant-safe lead management helper: the lead must belong to the current active workspace.';

commit;

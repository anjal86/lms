-- Allow authorized staff to create conversation AI state rows when pausing,
-- taking over, or resuming a conversation that does not yet have one.
-- The API uses INSERT ... ON CONFLICT (upsert), so UPDATE policy alone is
-- insufficient under RLS.

begin;

drop policy if exists conversation_ai_states_insert on public.conversation_ai_states;
create policy conversation_ai_states_insert on public.conversation_ai_states
for insert to authenticated
with check (
  public.current_user_active()
  and workspace_id = public.current_workspace_id()
  and public.can_access_conversation(conversation_id)
);

commit;

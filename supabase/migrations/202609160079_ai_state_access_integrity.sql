-- Agents may pause or take over AI only on conversations they can legitimately access.
-- Managers retain workspace-wide access through can_access_conversation().

begin;

drop policy if exists conversation_ai_states_update on public.conversation_ai_states;
create policy conversation_ai_states_update on public.conversation_ai_states
for update to authenticated
using (
  public.current_user_active()
  and workspace_id = public.current_workspace_id()
  and public.can_access_conversation(conversation_id)
)
with check (
  public.current_user_active()
  and workspace_id = public.current_workspace_id()
  and public.can_access_conversation(conversation_id)
);

commit;

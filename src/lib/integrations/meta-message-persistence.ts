import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type Provider = 'facebook' | 'instagram';
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type MetaMessageRow = Record<string, unknown> & { external_message_id: string };

export async function persistConnectionScopedMetaMessages(
  input: {
    workspaceId: string;
    conversationId: string;
    leadId: string | null;
    connectionId: string;
    provider: Provider;
    messages: MetaMessageRow[];
  },
  admin: AdminClient = createSupabaseAdminClient()
) {
  if (!input.messages.length) return 0;

  const ids = input.messages.map((message) => message.external_message_id);
  const { data: existing, error: existingError } = await admin
    .from('lead_messages')
    .select('id,workspace_id,conversation_id,external_message_id')
    .eq('connection_id', input.connectionId)
    .eq('provider', input.provider)
    .in('external_message_id', ids);
  if (existingError) throw existingError;

  const existingByExternalId = new Map(
    (existing || []).map((message) => [message.external_message_id, message])
  );
  let persisted = 0;

  for (const message of input.messages) {
    const current = existingByExternalId.get(message.external_message_id);
    if (!current) continue;
    if (
      current.workspace_id === input.workspaceId
      && current.conversation_id === input.conversationId
    ) continue;

    const { error: updateError } = await admin
      .from('lead_messages')
      .update({
        ...message,
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        lead_id: input.leadId,
        connection_id: input.connectionId,
        provider: input.provider,
      })
      .eq('id', current.id)
      .eq('connection_id', input.connectionId)
      .eq('provider', input.provider);
    if (updateError) throw updateError;
    persisted += 1;
  }

  const fresh = input.messages.filter(
    (message) => !existingByExternalId.has(message.external_message_id)
  );
  if (fresh.length) {
    const { error: insertError } = await admin.from('lead_messages').insert(fresh);
    if (insertError) throw insertError;
    persisted += fresh.length;
  }

  return persisted;
}

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

  const uniqueMessages = [...input.messages.reduce((messages, message) => {
    if (!messages.has(message.external_message_id)) {
      messages.set(message.external_message_id, message);
    }
    return messages;
  }, new Map<string, MetaMessageRow>()).values()];
  let persisted = 0;
  for (let start = 0; start < uniqueMessages.length; start += 20) {
    const chunk = uniqueMessages.slice(start, start + 20);
    const ids = chunk.map((message) => message.external_message_id);
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

    for (const message of chunk) {
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

    const fresh = chunk.filter(
      (message) => !existingByExternalId.has(message.external_message_id)
    );
    if (fresh.length) {
      const { error: insertError } = await admin.from('lead_messages').insert(fresh);
      if (!insertError) {
        persisted += fresh.length;
      } else if (insertError.code === '23505') {
        // Another history worker may have persisted the same provider message
        // after this chunk's lookup. Resolve that race one message at a time.
        for (const message of fresh) {
          const { data: concurrent, error: concurrentError } = await admin
            .from('lead_messages')
            .select('id,workspace_id,conversation_id')
            .eq('connection_id', input.connectionId)
            .eq('provider', input.provider)
            .eq('external_message_id', message.external_message_id)
            .maybeSingle();
          if (concurrentError) throw concurrentError;

          if (!concurrent) {
            const { error: retryError } = await admin.from('lead_messages').insert(message);
            if (retryError) throw retryError;
            persisted += 1;
          } else if (
            concurrent.workspace_id !== input.workspaceId
            || concurrent.conversation_id !== input.conversationId
          ) {
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
              .eq('id', concurrent.id)
              .eq('connection_id', input.connectionId)
              .eq('provider', input.provider);
            if (updateError) throw updateError;
            persisted += 1;
          }
        }
      } else {
        throw insertError;
      }
    }
  }

  return persisted;
}

-- Add unqualified unique indexes so PostgREST/Supabase .upsert({ onConflict: 'provider,external_message_id' }) works without partial index constraint errors
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_messages_provider_ext_msg_full 
  ON lead_messages (provider, external_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_conversations_provider_thread_full 
  ON lead_conversations (provider, external_thread_id);

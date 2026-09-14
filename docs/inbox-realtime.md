# Inbox realtime delivery

The Inbox has two distinct realtime concerns:

1. **Provider ingestion** imports new Facebook/Instagram messages into the CRM database.
2. **Supabase Realtime** updates open Inbox screens after those database rows change.

While the Inbox is visible, the client performs a bounded live provider sync every 30 seconds and when the browser returns to the foreground. Hidden tabs do not poll. This is a safety-net ingestion path so staff do not depend on the manual Refresh button.

`lead_conversations` and `lead_messages` are published to the `supabase_realtime` publication by migration `202609120046_inbox_realtime_publication.sql`, allowing the existing Inbox subscriptions to refresh the list and active thread after imported rows change.

The preferred long-term ingestion path is provider webhooks. Once webhook ingestion is enabled for all providers, the visible-Inbox polling can remain as a low-frequency recovery mechanism rather than the primary source of new messages.

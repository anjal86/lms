# Omnichannel production hardening

This repository treats omnichannel communication as a security- and data-integrity-sensitive subsystem.

Required invariants:

- User-facing conversation APIs must authorize through the authenticated RLS-scoped Supabase client before any service-role operation.
- Provider webhooks must be signature verified, durable, idempotent, retryable after failure, and return a non-2xx response when processing cannot complete.
- Conversation/message ingestion must be atomic at the database boundary.
- Conversation-to-lead conversion must be a single transaction and must never create two leads from one conversation.
- Every post-conversion message inherits the conversation's canonical `lead_id`.
- Remote media is fetched only through the authenticated media proxy with HTTPS-only hostname/DNS validation and bounded redirects/size/timeouts.
- Outbound messages use a client idempotency key and never report success unless the provider returns a provider message ID.
- Meta history sync is incremental and provider-aware; Facebook and Instagram identifiers are never collapsed under the wrong provider.
- Production readiness requires app-quality, database/RLS, security-regression, and E2E jobs to pass independently.

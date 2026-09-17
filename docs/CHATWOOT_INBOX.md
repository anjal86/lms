# Self-hosted Chatwoot Inbox

Chatwoot is used only for the operator Inbox. The rest of the CRM remains the existing Next.js/Supabase application.

## Architecture

- CRM: Next.js + Supabase
- Inbox UI / messaging engine: self-hosted Chatwoot Community Edition
- Chatwoot database: dedicated PostgreSQL/pgvector volume
- Chatwoot jobs: dedicated Redis + Sidekiq
- CRM ↔ Chatwoot linkage: existing `chatwoot_*` mapping/webhook tables and API routes
- `/inbox`: embeds the self-hosted Chatwoot web app
- If Chatwoot is not configured, `/inbox` falls back to the legacy CRM Inbox.

Chatwoot is pinned to `v4.17.1` in `docker/docker-compose.chatwoot.yml` rather than `latest` so upgrades are deliberate.

## First local setup

From the repository root:

```bash
npm run setup:chatwoot
npm run chatwoot:up
```

The setup helper writes/updates:

- `.env.local` for a host-run Next.js CRM
- `docker/.env` for the Chatwoot Docker services

It generates independent Chatwoot Postgres, Redis, Rails and Active Record encryption secrets when they do not already exist.

Open the first-install screen:

```text
http://localhost:3001/installation/onboarding
```

Create the first Chatwoot administrator and account.

Then create a personal access token in Chatwoot and save it into the CRM configuration:

```bash
npm run setup:chatwoot -- --token YOUR_CHATWOOT_TOKEN
```

Restart a host-run CRM after changing `.env.local`:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/inbox
```

The Chatwoot dashboard is served through a small Nginx proxy dedicated to the CRM Inbox embed. The proxy removes only the upstream `X-Frame-Options` header and limits `frame-ancestors` to the configured CRM origin.

## CRM mapping

Once the token exists, configure the CRM workspace mapping at:

```text
http://localhost:3000/inbox/channels/chatwoot
```

Use the Chatwoot Account ID and configure the Chatwoot account webhook to the URL shown on that screen. Then discover/map Chatwoot inboxes to the corresponding CRM channel connections.

## Commands

```bash
npm run chatwoot:up
npm run chatwoot:logs
npm run chatwoot:down
```

`chatwoot:down` stops the Chatwoot services but does not delete the Postgres, Redis or media volumes.

## Production

Set `CHATWOOT_PUBLIC_URL` / `NEXT_PUBLIC_CHATWOOT_INBOX_URL` to the HTTPS URL that serves the Chatwoot frame proxy, for example `https://inbox.example.com`. Set `NEXT_PUBLIC_APP_URL` to the HTTPS CRM origin so the frame proxy only allows the CRM to embed Chatwoot.

Keep the Chatwoot PostgreSQL database separate from the CRM/Supabase database. Do not copy full Chatwoot messages into Supabase; Chatwoot remains the message source of truth while the CRM owns leads, opportunities, tasks and business workflow.

# Wanderlust Travel CRM

A Next.js + Supabase travel-sales CRM for lead capture, assignment, follow-ups, quotations, payments, traveler operations, team management, SLA enforcement, and reporting.

## What is implemented

- Real Supabase email/password authentication.
- Role-based access for `admin`, `manager`, and `agent` users.
- Row Level Security for profiles, leads, follow-ups, notifications, settings, incentives, and activity data.
- Secure inbound lead webhook with Bearer authentication, validation, idempotency, persistence, and database-side atomic routing.
- Server-side first-response SLA enforcement and missed-follow-up processing.
- Optional automatic SLA reassignment to another available agent.
- Database-derived workload, profit, margin, commission, and lead metrics.
- Quotation, payment, itinerary, passenger, supplier-payable, checklist, and post-trip data on each lead.
- CSV import/export with quoted-field parsing and spreadsheet-formula protection.
- Append-only activity history for normal authenticated users.
- Protected team invitation, agency settings, and incentive administration APIs.
- Deterministic CI and Docker builds using `package-lock.json` and `npm ci`.

## Requirements

- Node.js 20.19+
- npm
- A Supabase project, or Docker for the bundled self-hosted development stack

## Local application setup

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Configure at minimum:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
LEADS_WEBHOOK_SECRET=generate-a-long-random-secret
SLA_CRON_SECRET=generate-a-different-long-random-secret
```

Never expose the service-role key, webhook secret, or SLA secret through a `NEXT_PUBLIC_*` variable.

## Database migrations

`supabase/migrations/` is the canonical database schema. Apply migrations in numeric order to hosted Supabase before deploying application code that depends on them.

The current migrations cover:

1. Core CRM schema, RLS, profile bootstrap, settings, templates, and incentives.
2. Service-only workload helper functions.
3. Latest quotation snapshot support.
4. Database-derived workload and financial metrics.
5. Atomic server-side lead routing.

Do not restore the removed duplicate SQL schemas under `src/` or `docker/init-scripts/`; they are no longer sources of truth.

## Create the first admin

Public signup is disabled by default. After migrations are applied, bootstrap an administrator with the service-role credentials loaded into your shell:

```bash
npm run admin:create -- --email admin@example.com --password "use-a-strong-password" --name "Agency Admin"
```

The command does not print the password. If the auth user already exists, it resolves the existing user and provisions the admin CRM profile.

## Inbound lead webhook

Endpoint:

```text
POST /api/leads/webhook
```

Required header:

```text
Authorization: Bearer <LEADS_WEBHOOK_SECRET>
```

Recommended header for upstream retry safety:

```text
Idempotency-Key: <stable-source-event-id>
```

Example body:

```json
{
  "customer_name": "Rohan Sharma",
  "customer_phone": "+919876543210",
  "customer_email": "rohan@example.com",
  "destination": "Bali",
  "budget_range": "$2,000 - $3,000",
  "travel_dates": "Nov 10-17, 2026",
  "pax_adults": 2,
  "travel_type": "honeymoon",
  "source": "meta_ads",
  "external_id": "meta-lead-12345"
}
```

The API validates the payload, records the idempotency key, persists the lead, and asks the database to assign the best currently available agent atomically. Assignment respects active/available/accepting status, capacity, destination tags, and workload.

## SLA worker

The protected endpoint below performs server-side SLA processing:

```text
POST /api/cron/sla
Authorization: Bearer <SLA_CRON_SECRET>
```

It:

- marks overdue first responses as breached;
- notifies the assigned agent;
- optionally escalates to active managers/admins;
- optionally reassigns leads after the configured reassignment window;
- marks overdue pending follow-ups as missed;
- sends follow-up escalation notifications.

For hosted deployments, call the endpoint from your scheduler/cron provider. For the bundled Docker setup, the `sla-worker` service calls it every `SLA_INTERVAL_SECONDS` seconds (default `60`).

## Docker stack

Create a real environment file first; there are intentionally no production-safe fallback secrets.

```bash
cp .env.example .env
cd docker
docker compose up -d --build
```

The application binds to localhost by default. Supabase Studio is development-only:

```bash
docker compose --profile dev up -d --build
```

Important: `NEXT_PUBLIC_*` values are supplied to the Docker build as build arguments because Next.js embeds public environment variables in the client bundle at build time.

### Redis

The Docker stack starts Redis 7.4 as the `redis` service with a persistent `redis-data` volume and append-only logging. It binds to `127.0.0.1:${REDIS_PORT:-6379}` on the host. The Docker app connects to `redis://redis:6379`; a host-run app uses `REDIS_URL=redis://127.0.0.1:6379` from `.env.local`.

Redis holds short-lived API response caches and the integration-history sync queue. Postgres remains the source of truth. If Redis is unavailable, cached API reads fall back to Postgres, while integration-history sync pauses until Redis returns. The background worker calls `/api/cron/integration-sync` every `INTEGRATION_SYNC_INTERVAL_SECONDS` seconds.

Check Redis without exposing application data:

```bash
cd docker
docker compose ps redis
docker compose exec redis redis-cli ping
```

The app's `/api/health` response reports Redis as `reachable`, `unreachable`, or `not_configured`. The queue and cache share this Redis instance, so keep its persistent volume and use `noeviction` when configuring a memory limit; evicting queued jobs would lose pending work.

## Quality checks

Run the same checks used by GitHub Actions:

```bash
npm run check
```

This runs ESLint, TypeScript, application tests, and a production build.

CI uses `npm ci` against the committed lockfile, so dependency installation is reproducible.

## Security notes

- Do not enable public signup unless you intentionally redesign account provisioning.
- Do not put service-role credentials in browser code.
- Keep `LEADS_WEBHOOK_SECRET` and `SLA_CRON_SECRET` different and at least 32 random characters.
- Agents should not receive unrestricted CRM datasets; RLS is the final authorization boundary.
- Sensitive travel documents should be stored in a private object-storage bucket with short-lived signed URLs rather than public URLs.
- Production backups should be database/storage backups, not browser JSON restore operations.

## Current architecture direction

The application is intentionally moving away from browser-owned business logic. Authentication, authorization, routing, SLA processing, workload accounting, financial derivation, and privileged administration belong on the server/database. Client code should focus on presentation, optimistic UX, and user-triggered actions.

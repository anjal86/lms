# Supabase Self-Hosted Docker Stack for Travel LMS

This directory contains a complete, production-ready local Supabase Docker Compose stack pre-configured for the **Travel Leads Management System**.

## Services Included

- **PostgreSQL 15** (`port 5432`) - Database with UUID, pgcrypto, and extensions.
- **Kong API Gateway** (`port 8000`) - Unified REST & Auth routing.
- **GoTrue Auth** (`/auth/v1`) - Authentication service.
- **PostgREST** (`/rest/v1`) - Instant Auto-generated REST APIs.
- **Supabase Realtime** (`port 4000`) - WebSocket pub/sub for instant lead notifications.
- **Supabase Studio** (`http://localhost:54323`) - Full graphical database & SQL dashboard.
- **Pre-loaded Schemas & Seeds** (`init-scripts/`):
  - `01-schema.sql`: Full tables, RLS policies, indexes, and triggers.
  - `02-seed.sql`: Realistic agents (Alex, Emma, Michael), 10+ travel leads, follow-up tasks, WhatsApp templates, and SLA rules.

## Quick Start

### 1. In Docker Desktop (Windows) or Linux/WSL:
Open terminal in `docker/`:
```bash
docker compose up -d
```

### 2. Access Dashboards:
- **Supabase Studio GUI**: [http://localhost:54323](http://localhost:54323)
- **API URL**: `http://localhost:8000`
- **Postgres Direct Port**: `5432` (User: `postgres`, Password: `postgrespassword`)

### 3. Connect Next.js Application:
In the root directory, create/update `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.M4m_8c6x9yL-T13WvK0B-Wc2c7p6A6X4Wd_sXvL2p8Q
```
*(The app also runs in standalone instant demo mode with rich reactive state out of the box!)*

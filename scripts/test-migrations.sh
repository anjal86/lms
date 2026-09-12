#!/usr/bin/env bash
set -euo pipefail

IMAGE="${MIGRATION_TEST_IMAGE:-postgres:15-alpine}"
CONTAINER="lms-migration-test-${GITHUB_RUN_ID:-local}-$$"
PASSWORD="migration-test-password"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting disposable PostgreSQL ($IMAGE)..."
if ! container_id="$(docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_DB=postgres \
  "$IMAGE")"; then
  echo "Failed to start PostgreSQL container."
  exit 1
fi
echo "    container: ${container_id:0:12}"

ready=false
for _ in $(seq 1 60); do
  if docker exec -e PGPASSWORD="$PASSWORD" "$CONTAINER" \
    pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
    echo "PostgreSQL container exited during startup:"
    docker logs "$CONTAINER" || true
    exit 1
  fi
  sleep 1
done

if [[ "$ready" != "true" ]]; then
  echo "PostgreSQL did not become ready in time:"
  docker logs "$CONTAINER" || true
  exit 1
fi

PSQL=(psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U postgres -d postgres)

echo "==> Bootstrapping Supabase-compatible roles and auth schema..."
docker exec -e PGPASSWORD="$PASSWORD" -i "$CONTAINER" "${PSQL[@]}" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''), current_user);
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
SQL

echo "==> Applying application migrations..."
for sql in supabase/migrations/*.sql; do
  echo "    $(basename "$sql")"
  docker exec -e PGPASSWORD="$PASSWORD" -i "$CONTAINER" "${PSQL[@]}" < "$sql"
done

echo "==> Granting API role privileges..."
docker exec -e PGPASSWORD="$PASSWORD" -i "$CONTAINER" "${PSQL[@]}" <<'SQL'
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;
SQL

echo "==> Seeding RLS fixtures..."
docker exec -e PGPASSWORD="$PASSWORD" -i "$CONTAINER" "${PSQL[@]}" <<'SQL'
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
values
  ('11111111-1111-1111-1111-111111111111','admin@test.local','{"full_name":"Admin"}'::jsonb,now(),now()),
  ('22222222-2222-2222-2222-222222222222','agent@test.local','{"full_name":"Agent"}'::jsonb,now(),now()),
  ('33333333-3333-3333-3333-333333333333','disabled@test.local','{"full_name":"Disabled"}'::jsonb,now(),now()),
  ('44444444-4444-4444-4444-444444444444','other@test.local','{"full_name":"Other Agent"}'::jsonb,now(),now())
on conflict (id) do nothing;

-- Supabase service-role requests carry role=service_role in request.jwt.claims. Set the
-- same context here so SECURITY DEFINER protection triggers exercise the production path
-- instead of falling back to their function-owner current_user.
set role service_role;
set request.jwt.claims = '{"role":"service_role"}';
update public.profiles set role='admin', is_active=true where id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='agent', is_active=true where id='22222222-2222-2222-2222-222222222222';
update public.profiles set role='agent', is_active=false where id='33333333-3333-3333-3333-333333333333';
update public.profiles set role='agent', is_active=true where id='44444444-4444-4444-4444-444444444444';
reset request.jwt.claims;
reset role;

insert into public.leads(id,customer_name,customer_phone,destination,assigned_to,stage)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Agent Lead','+10000000001','Japan','22222222-2222-2222-2222-222222222222','new'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','Admin Lead','+10000000002','Nepal','11111111-1111-1111-1111-111111111111','new'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','Shared Lead','+10000000003','Bhutan',null,'new')
on conflict (id) do nothing;

insert into public.lead_conversations(id,provider,external_thread_id,customer_name,assigned_to,status,last_message_at)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1','facebook','page:agent','Agent Chat','22222222-2222-2222-2222-222222222222','open',now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2','facebook','page:other','Other Chat','44444444-4444-4444-4444-444444444444','open',now())
on conflict (id) do nothing;
SQL

query_as() {
  local uid="$1"
  local sql="$2"
  docker exec -e PGPASSWORD="$PASSWORD" -i "$CONTAINER" \
    psql -h 127.0.0.1 -U postgres -d postgres -Atqc \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"${uid}\",\"role\":\"authenticated\"}'; ${sql}"
}

agent_role="$(query_as '22222222-2222-2222-2222-222222222222' 'select coalesce(public.current_user_role(),'''');')"
admin_role="$(query_as '11111111-1111-1111-1111-111111111111' 'select coalesce(public.current_user_role(),'''');')"
admin_management="$(query_as '11111111-1111-1111-1111-111111111111' 'select public.is_management();')"
agent_count="$(query_as '22222222-2222-2222-2222-222222222222' 'select count(*) from public.leads;')"
admin_count="$(query_as '11111111-1111-1111-1111-111111111111' 'select count(*) from public.leads;')"
disabled_count="$(query_as '33333333-3333-3333-3333-333333333333' 'select count(*) from public.leads;')"
disabled_profiles="$(query_as '33333333-3333-3333-3333-333333333333' 'select count(*) from public.profiles;')"
agent_chat_access="$(query_as '22222222-2222-2222-2222-222222222222' "select public.can_access_conversation('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');")"
other_chat_access="$(query_as '22222222-2222-2222-2222-222222222222' "select public.can_access_conversation('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');")"

[[ "$agent_role" == "agent" ]] || { echo "Expected agent fixture role=agent, got '$agent_role'"; exit 1; }
[[ "$admin_role" == "admin" ]] || { echo "Expected admin fixture role=admin, got '$admin_role'"; exit 1; }
[[ "$admin_management" == "t" ]] || { echo "Expected admin to satisfy is_management(), got '$admin_management'"; exit 1; }
[[ "$agent_count" == "2" ]] || { echo "Expected active agent to see assigned + shared leads, got $agent_count"; exit 1; }
[[ "$admin_count" == "3" ]] || { echo "Expected admin to see all 3 leads, got $admin_count"; exit 1; }
[[ "$disabled_count" == "0" ]] || { echo "Expected disabled user to see 0 leads, got $disabled_count"; exit 1; }
[[ "$disabled_profiles" == "0" ]] || { echo "Expected disabled user to see 0 profiles, got $disabled_profiles"; exit 1; }
[[ "$agent_chat_access" == "t" ]] || { echo "Expected agent to access assigned conversation"; exit 1; }
[[ "$other_chat_access" == "f" ]] || { echo "Agent unexpectedly accessed another agent's conversation"; exit 1; }

echo "==> Migration chain and RLS smoke tests passed."

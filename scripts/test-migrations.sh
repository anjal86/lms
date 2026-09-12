#!/usr/bin/env bash
set -euo pipefail

IMAGE="${MIGRATION_TEST_IMAGE:-supabase/postgres:15.8.1.085}"
CONTAINER="lms-migration-test-${GITHUB_RUN_ID:-local}-$$"
PASSWORD="migration-test-password"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting disposable Supabase Postgres..."
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD="$PASSWORD" \
  -e POSTGRES_DB=postgres \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$CONTAINER" pg_isready -U postgres -d postgres >/dev/null

echo "==> Preparing Supabase roles..."
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres <<'SQL'
ALTER ROLE postgres SUPERUSER;
GRANT ALL ON SCHEMA auth TO postgres, supabase_auth_admin;
GRANT ALL ON SCHEMA storage TO postgres, supabase_storage_admin;
SQL

echo "==> Applying application migrations..."
for sql in supabase/migrations/*.sql; do
  echo "    $(basename "$sql")"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres < "$sql"
done

echo "==> Granting API role privileges..."
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
SQL

echo "==> Seeding RLS fixtures..."
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at)
values
  ('11111111-1111-1111-1111-111111111111','admin@test.local','{"full_name":"Admin"}'::jsonb,now(),now()),
  ('22222222-2222-2222-2222-222222222222','agent@test.local','{"full_name":"Agent"}'::jsonb,now(),now()),
  ('33333333-3333-3333-3333-333333333333','disabled@test.local','{"full_name":"Disabled"}'::jsonb,now(),now())
on conflict (id) do nothing;

update public.profiles set role='admin', is_active=true where id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='agent', is_active=true where id='22222222-2222-2222-2222-222222222222';
update public.profiles set role='agent', is_active=false where id='33333333-3333-3333-3333-333333333333';

insert into public.leads(id,customer_name,customer_phone,destination,assigned_to,stage)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','Agent Lead','+10000000001','Japan','22222222-2222-2222-2222-222222222222','new'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2','Admin Lead','+10000000002','Nepal','11111111-1111-1111-1111-111111111111','new'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','Shared Lead','+10000000003','Bhutan',null,'new')
on conflict (id) do nothing;
SQL

query_as() {
  local uid="$1"
  local sql="$2"
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -Atqc \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"${uid}\",\"role\":\"authenticated\"}'; ${sql}"
}

agent_count="$(query_as '22222222-2222-2222-2222-222222222222' 'select count(*) from public.leads;')"
admin_count="$(query_as '11111111-1111-1111-1111-111111111111' 'select count(*) from public.leads;')"
disabled_count="$(query_as '33333333-3333-3333-3333-333333333333' 'select count(*) from public.leads;')"
disabled_profiles="$(query_as '33333333-3333-3333-3333-333333333333' 'select count(*) from public.profiles;')"

[[ "$agent_count" == "2" ]] || { echo "Expected active agent to see assigned + shared leads, got $agent_count"; exit 1; }
[[ "$admin_count" == "3" ]] || { echo "Expected admin to see all 3 leads, got $admin_count"; exit 1; }
[[ "$disabled_count" == "0" ]] || { echo "Expected disabled user to see 0 leads, got $disabled_count"; exit 1; }
[[ "$disabled_profiles" == "0" ]] || { echo "Expected disabled user to see 0 profiles, got $disabled_profiles"; exit 1; }

echo "==> Migration chain and RLS smoke tests passed."

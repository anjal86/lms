#!/bin/sh
set -eu

echo "==> Configuring database roles, passwords, and permissions..."
psql -v ON_ERROR_STOP=1 --no-password -U supabase_admin -d "${POSTGRES_DB:-postgres}" <<EOF
ALTER ROLE postgres SUPERUSER;
ALTER USER postgres WITH PASSWORD '${POSTGRES_PASSWORD}';
ALTER USER authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';
ALTER USER supabase_admin WITH PASSWORD '${POSTGRES_PASSWORD}';
GRANT ALL ON SCHEMA auth TO postgres, supabase_auth_admin;
GRANT ALL ON SCHEMA storage TO postgres, supabase_storage_admin;
ALTER USER postgres SET search_path TO auth, public, extensions;
ALTER ROLE supabase_admin SET search_path TO auth, public, extensions;
do \$\$ begin
  ALTER TYPE public.factor_type SET SCHEMA auth;
  ALTER TYPE public.factor_status SET SCHEMA auth;
  ALTER TYPE public.aal_level SET SCHEMA auth;
  ALTER TYPE public.code_challenge_method SET SCHEMA auth;
  ALTER TYPE public.one_time_token_type SET SCHEMA auth;
exception
  when undefined_object then null;
end \$\$;
EOF

echo "==> Running Wanderlust CRM application migrations..."
for sql in /app-migrations/*.sql; do
  echo "==> Applying: $sql"
  psql -v ON_ERROR_STOP=1 --no-password -U supabase_admin -d "${POSTGRES_DB:-postgres}" -f "$sql"
done

echo "==> Granting public schema permissions to Supabase roles..."
psql -v ON_ERROR_STOP=1 --no-password -U supabase_admin -d "${POSTGRES_DB:-postgres}" <<'EOF'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
EOF

echo "==> Wanderlust CRM database migrations complete!"

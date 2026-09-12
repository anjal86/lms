-- Create a private bucket for traveler documents only when a compatible
-- Supabase Storage schema is installed. Database-only/self-hosted Postgres
-- images may expose storage.buckets with a different internal shape; those
-- environments must not fail the application migration chain.

do $$
declare
  has_compatible_bucket_schema boolean;
begin
  select
    to_regclass('storage.buckets') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'id'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'name'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
    )
  into has_compatible_bucket_schema;

  if has_compatible_bucket_schema then
    execute $bucket$
      insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
      values (
        'travel-documents',
        'travel-documents',
        false,
        10485760,
        array['application/pdf','image/jpeg','image/png','image/webp']::text[]
      )
      on conflict (id) do update
        set public = false,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $bucket$;
  else
    raise notice 'Skipping travel-documents bucket creation: compatible Supabase Storage schema is not installed.';
  end if;
end
$$;

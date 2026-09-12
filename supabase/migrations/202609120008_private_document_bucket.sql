-- Create a private bucket for traveler documents when Supabase Storage is installed.
-- Self-hosted deployments without the Storage service safely skip this migration block.

do $$
begin
  if to_regclass('storage.buckets') is not null then
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
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

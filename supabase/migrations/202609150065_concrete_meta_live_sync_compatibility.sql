-- 202609150065_concrete_meta_live_sync_compatibility.sql
-- The live Meta polling worker historically iterates config.pages[]. Concrete account
-- connections created by the new authorization picker store page_id / IG account IDs
-- directly. Normalize those concrete configs so both the legacy poller and the new
-- account-scoped history workers address the same selected business asset.

begin;

create or replace function public.normalize_concrete_meta_connection_config()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_page_id text;
  v_page_name text;
  v_ig_id text;
  v_ig_username text;
  v_page jsonb;
begin
  if new.provider not in ('facebook','instagram') then
    return new;
  end if;

  if coalesce((new.config->>'authorization_container')::boolean, false)
     or coalesce((new.config->>'legacy_container')::boolean, false) then
    return new;
  end if;

  if jsonb_typeof(new.config->'pages') = 'array'
     and jsonb_array_length(new.config->'pages') > 0 then
    return new;
  end if;

  v_page_id := nullif(new.config->>'page_id','');
  v_page_name := coalesce(nullif(new.config->>'page_name',''), nullif(new.display_name,''), v_page_id);
  if v_page_id is null then
    return new;
  end if;

  if new.provider = 'facebook' then
    v_page := jsonb_build_object(
      'id', v_page_id,
      'name', v_page_name
    );
  else
    v_ig_id := coalesce(nullif(new.config->>'instagram_business_account_id',''), nullif(new.external_account_id,''));
    if v_ig_id is null then
      return new;
    end if;
    v_ig_username := nullif(new.config->>'instagram_username','');
    v_page := jsonb_build_object(
      'id', v_page_id,
      'name', v_page_name,
      'instagram_business_account', jsonb_strip_nulls(jsonb_build_object(
        'id', v_ig_id,
        'username', v_ig_username,
        'name', coalesce(v_ig_username, v_page_name)
      ))
    );
  end if;

  new.config := jsonb_set(coalesce(new.config, '{}'::jsonb), '{pages}', jsonb_build_array(v_page), true);
  return new;
end;
$$;

drop trigger if exists trg_normalize_concrete_meta_connection_config on public.integration_connections;
create trigger trg_normalize_concrete_meta_connection_config
before insert or update of provider, display_name, external_account_id, config
on public.integration_connections
for each row execute function public.normalize_concrete_meta_connection_config();

-- Backfill concrete rows that were already created by the account picker before the
-- normalization trigger existed. The trigger performs the actual config rewrite.
update public.integration_connections
set config = config
where provider in ('facebook','instagram')
  and status <> 'disconnected'
  and coalesce((config->>'authorization_container')::boolean, false) = false
  and coalesce((config->>'legacy_container')::boolean, false) = false
  and nullif(config->>'page_id','') is not null
  and (
    jsonb_typeof(config->'pages') is distinct from 'array'
    or jsonb_array_length(coalesce(config->'pages','[]'::jsonb)) = 0
  );

comment on function public.normalize_concrete_meta_connection_config() is
  'Keeps concrete Meta account config compatible with live polling without changing tenant ownership.';

commit;

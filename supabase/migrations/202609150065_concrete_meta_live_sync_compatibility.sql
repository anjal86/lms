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
  v_config jsonb := coalesce(new.config, '{}'::jsonb);
  v_page_id text;
  v_page_name text;
  v_ig_id text;
  v_ig_username text;
  v_page jsonb;
begin
  if new.provider not in ('facebook','instagram') then
    return new;
  end if;

  if lower(coalesce(v_config->>'authorization_container','false')) = 'true'
     or lower(coalesce(v_config->>'legacy_container','false')) = 'true' then
    return new;
  end if;

  if jsonb_typeof(v_config->'pages') = 'array' then
    if jsonb_array_length(v_config->'pages') > 0 then
      return new;
    end if;
  end if;

  v_page_id := nullif(v_config->>'page_id','');
  v_page_name := coalesce(nullif(v_config->>'page_name',''), nullif(new.display_name,''), v_page_id);
  if v_page_id is null then
    return new;
  end if;

  if new.provider = 'facebook' then
    v_page := jsonb_build_object(
      'id', v_page_id,
      'name', v_page_name
    );
  else
    v_ig_id := coalesce(nullif(v_config->>'instagram_business_account_id',''), nullif(new.external_account_id,''));
    if v_ig_id is null then
      return new;
    end if;
    v_ig_username := nullif(v_config->>'instagram_username','');
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

  new.config := jsonb_set(v_config, '{pages}', jsonb_build_array(v_page), true);
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
  and lower(coalesce(config->>'authorization_container','false')) <> 'true'
  and lower(coalesce(config->>'legacy_container','false')) <> 'true'
  and nullif(config->>'page_id','') is not null
  and case
    when jsonb_typeof(config->'pages') = 'array' then jsonb_array_length(config->'pages') = 0
    else true
  end;

comment on function public.normalize_concrete_meta_connection_config() is
  'Keeps concrete Meta account config compatible with live polling without changing tenant ownership.';

commit;

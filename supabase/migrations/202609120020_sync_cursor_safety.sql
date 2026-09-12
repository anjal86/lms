-- Prevent partial provider sync failures from advancing a connection cursor past
-- messages that were not fetched. Reprocessing successful pages is safe because
-- provider message IDs and conversation threads are idempotent.
begin;

create or replace function public.preserve_integration_cursor_on_error()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.last_error is not null and btrim(new.last_error) <> '' then
    new.last_external_timestamp := old.last_external_timestamp;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_preserve_integration_cursor_on_error on public.integration_connections;
create trigger trg_preserve_integration_cursor_on_error
before update of last_external_timestamp, last_error on public.integration_connections
for each row execute function public.preserve_integration_cursor_on_error();

commit;

-- 202609150066_social_identity_phone_cleanup.sql
-- Facebook PSIDs / Instagram scoped user IDs are external channel identities, not phone
-- numbers. Older live-sync code encoded them as facebook:<id> / instagram:<id>, which can
-- contaminate conversation, Contact and Opportunity phone fields. Strip that legacy form
-- at the conversation boundary and repair existing rows.

begin;

create or replace function public.sanitize_social_pseudo_phone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provider in ('facebook','instagram')
     and nullif(btrim(new.customer_phone), '') is not null
     and lower(btrim(new.customer_phone)) ~ '^(facebook|instagram):' then
    new.customer_phone := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sanitize_social_pseudo_phone on public.lead_conversations;
create trigger trg_sanitize_social_pseudo_phone
before insert or update of provider, customer_phone
on public.lead_conversations
for each row execute function public.sanitize_social_pseudo_phone();

-- Repair the canonical conversation source first. Existing external_contact_id remains
-- intact and the connection-scoped external identity continues to represent the user.
update public.lead_conversations
set customer_phone = null,
    updated_at = now()
where provider in ('facebook','instagram')
  and lower(btrim(coalesce(customer_phone, ''))) ~ '^(facebook|instagram):';

-- Remove only the exact historical pseudo-phone shape. Real telephone numbers and email /
-- external identities are untouched.
delete from public.contact_identities
where identity_type = 'phone'
  and lower(btrim(coalesce(identity_value, ''))) ~ '^(facebook|instagram):';

update public.contacts
set primary_phone = null,
    updated_at = now()
where lower(btrim(coalesce(primary_phone, ''))) ~ '^(facebook|instagram):';

update public.leads
set customer_phone = null,
    updated_at = now()
where lower(btrim(coalesce(customer_phone, ''))) ~ '^(facebook|instagram):';

comment on function public.sanitize_social_pseudo_phone() is
  'Prevents Facebook/Instagram scoped user IDs from being persisted as telephone numbers.';

commit;

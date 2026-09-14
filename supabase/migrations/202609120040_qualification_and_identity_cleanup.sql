-- 202609120040_qualification_and_identity_cleanup.sql
-- Finalize the Contact/Opportunity boundary and activate workspace-configured qualification.

begin;

-- Re-parenting an Opportunity to another Contact (for example during a merge) must not
-- treat the Opportunity snapshot as a new canonical identity edit.
drop trigger if exists trg_leads_link_contact_identity on public.leads;
create trigger trg_leads_link_contact_identity
before insert or update of customer_name, customer_phone, customer_email
on public.leads
for each row execute function public.link_lead_contact_identity();

-- Mark the industry-pack fields that define early qualification. Managers can add more
-- qualification criteria to custom fields through Business Setup.
update public.field_definitions fd
set validation = coalesce(fd.validation, '{}'::jsonb) || '{"qualification":true}'::jsonb,
    updated_at = now()
from public.workspaces w
where fd.workspace_id = w.id
  and fd.entity_type = 'lead'
  and fd.is_active = true
  and (
    (w.business_type = 'travel' and fd.field_key in (
      'destination','travel_dates','pax_adults','budget_range','travel_type','hotel_category'
    ))
    or (w.business_type in ('consultancy','education') and fd.field_key in (
      'study_destination','intake','qualification','language_test','language_score','course'
    ))
    or (w.business_type in ('agency','services') and fd.field_key in (
      'service_interest','project_budget','project_deadline','brief'
    ))
    or (w.business_type = 'health' and fd.field_key in (
      'service_interest','consultation_date','client_goal','consultation_status'
    ))
    or (w.business_type = 'generic' and fd.field_key in (
      'interest','budget','target_date','notes'
    ))
  );

commit;

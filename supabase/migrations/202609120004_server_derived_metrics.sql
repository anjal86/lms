-- Keep workload and financial metrics authoritative in PostgreSQL.

create or replace function public.recompute_profile_load(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if profile_id is null then
    return;
  end if;

  update public.profiles
  set current_load = (
    select count(*)::integer
    from public.leads
    where assigned_to = profile_id
      and stage not in ('won', 'lost', 'junk')
  )
  where id = profile_id;
end;
$$;

revoke all on function public.recompute_profile_load(uuid) from public, anon, authenticated;
grant execute on function public.recompute_profile_load(uuid) to service_role;

create or replace function public.sync_profile_load_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_profile_load(old.assigned_to);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform public.recompute_profile_load(new.assigned_to);
    return new;
  end if;

  if old.assigned_to is distinct from new.assigned_to
     or old.stage is distinct from new.stage then
    perform public.recompute_profile_load(old.assigned_to);
    perform public.recompute_profile_load(new.assigned_to);
  end if;

  return new;
end;
$$;

revoke all on function public.sync_profile_load_from_lead() from public, anon, authenticated;

drop trigger if exists zzz_sync_profile_load on public.leads;
create trigger zzz_sync_profile_load
after insert or delete or update of assigned_to, stage on public.leads
for each row execute function public.sync_profile_load_from_lead();

-- Backfill counters for existing records.
do $$
declare
  profile_record record;
begin
  for profile_record in select id from public.profiles loop
    perform public.recompute_profile_load(profile_record.id);
  end loop;
end;
$$;

create or replace function public.derive_lead_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_sales numeric(14,2) := 0;
  selected_rate numeric(7,2) := 0;
  selected_margin numeric(7,2) := 0;
begin
  if new.package_sale_price is not null and new.vendor_net_cost is not null then
    new.package_sale_price := greatest(0, new.package_sale_price);
    new.vendor_net_cost := greatest(0, new.vendor_net_cost);
    new.gross_profit := greatest(0, new.package_sale_price - new.vendor_net_cost);
    new.profit_margin_pct := case
      when new.package_sale_price > 0
        then round((new.gross_profit / new.package_sale_price) * 100, 2)
      else 0
    end;
  end if;

  if new.stage = 'won'
     and new.assigned_to is not null
     and new.package_sale_price is not null
     and new.gross_profit is not null then

    select coalesce(sum(package_sale_price), 0)
      into prior_sales
    from public.leads
    where assigned_to = new.assigned_to
      and stage = 'won'
      and id <> new.id;

    select commission_pct_profit, min_margin_threshold
      into selected_rate, selected_margin
    from public.incentive_tiers
    where (prior_sales + new.package_sale_price) >= min_sales
      and (max_sales is null or (prior_sales + new.package_sale_price) < max_sales)
    order by min_sales desc
    limit 1;

    if found then
      if coalesce(new.profit_margin_pct, 0) < selected_margin then
        selected_rate := selected_rate * 0.5;
      end if;
      new.agent_commission_earned := round(new.gross_profit * (selected_rate / 100), 2);
    else
      new.agent_commission_earned := 0;
    end if;

    new.won_deal_value := new.package_sale_price;

    if tg_op = 'INSERT' or old.stage is distinct from 'won' then
      new.commission_status := 'accrued';
    elsif old.commission_status in ('approved', 'paid') then
      new.commission_status := old.commission_status;
    else
      new.commission_status := coalesce(new.commission_status, 'accrued');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.derive_lead_financials() from public, anon, authenticated;

drop trigger if exists zzy_derive_lead_financials on public.leads;
create trigger zzy_derive_lead_financials
before insert or update of stage, package_sale_price, vendor_net_cost, assigned_to on public.leads
for each row execute function public.derive_lead_financials();

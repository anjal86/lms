alter table public.leads
  add column if not exists latest_quote jsonb;

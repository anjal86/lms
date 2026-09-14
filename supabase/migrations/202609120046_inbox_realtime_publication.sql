do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'lead_conversations'
    ) then
      alter publication supabase_realtime add table public.lead_conversations;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'lead_messages'
    ) then
      alter publication supabase_realtime add table public.lead_messages;
    end if;
  end if;
end
$$;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(10).max(500).default(50),
  tab: z.enum(['all', 'my', 'overdue', 'sla_pending', 'won']).default('all'),
  q: z.string().trim().max(120).default(''),
  dest: z.string().trim().max(160).default('ALL'),
  trip: z.enum(['ALL', 'planning', 'booked', 'pre_departure', 'on_trip', 'completed']).default('ALL'),
});

function safeFilterTerm(value: string) {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_active) return NextResponse.json({ error: 'Account disabled.' }, { status: 403 });

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query.', fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const input = parsed.data;
  const start = (input.page - 1) * input.pageSize;
  const end = start + input.pageSize - 1;

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(start, end);

  if (input.tab === 'my') query = query.eq('assigned_to', user.id);
  if (input.tab === 'overdue') {
    query = query
      .not('next_follow_up_at', 'is', null)
      .lt('next_follow_up_at', new Date().toISOString())
      .neq('stage', 'won')
      .neq('stage', 'lost')
      .neq('stage', 'junk');
  }
  if (input.tab === 'sla_pending') query = query.is('first_contacted_at', null).eq('stage', 'new');
  if (input.tab === 'won') query = query.eq('stage', 'won');
  if (input.dest !== 'ALL') query = query.eq('destination', input.dest);
  if (input.trip !== 'ALL') query = query.eq('trip_status', input.trip);

  const term = safeFilterTerm(input.q);
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `customer_name.ilike.${pattern},lead_code.ilike.${pattern},destination.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern}`
    );
  }

  const [leadResult, summaryResult] = await Promise.all([
    query,
    supabase.rpc('lead_pipeline_summary'),
  ]);

  if (leadResult.error) {
    console.error('Paginated lead query failed:', leadResult.error.message);
    return NextResponse.json({ error: 'Unable to load leads.' }, { status: 500 });
  }
  if (summaryResult.error) {
    console.error('Lead summary query failed:', summaryResult.error.message);
    return NextResponse.json({ error: 'Unable to load pipeline summary.' }, { status: 500 });
  }

  const total = leadResult.count || 0;
  return NextResponse.json(
    {
      items: leadResult.data || [],
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      summary: summaryResult.data || {},
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

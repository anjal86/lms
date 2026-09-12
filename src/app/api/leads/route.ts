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
  channel: z.string().trim().max(80).default('ALL'),
});

type SummaryLead = {
  assigned_to: string | null;
  first_contacted_at: string | null;
  next_follow_up_at: string | null;
  stage: string;
  destination: string | null;
  won_deal_value: number | null;
  package_sale_price: number | null;
};

function safeFilterTerm(value: string) {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function buildSummaryFallback(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const { data, error } = await supabase
    .from('leads')
    .select('assigned_to,first_contacted_at,next_follow_up_at,stage,destination,won_deal_value,package_sale_price')
    .limit(5000);

  if (error) throw error;

  const rows = (data || []) as SummaryLead[];
  const now = Date.now();
  const won = rows.filter((lead) => lead.stage === 'won');
  const active = rows.filter((lead) => !['won', 'lost', 'junk'].includes(lead.stage));

  return {
    visible_count: active.length,
    my_count: active.filter((lead) => lead.assigned_to === userId).length,
    pending_sla_count: rows.filter((lead) => lead.stage === 'new' && !lead.first_contacted_at).length,
    overdue_count: rows.filter((lead) => Boolean(lead.next_follow_up_at) && new Date(lead.next_follow_up_at as string).getTime() < now && !['won', 'lost', 'junk'].includes(lead.stage)).length,
    won_count: won.length,
    won_value: won.reduce((sum, lead) => sum + Number(lead.package_sale_price || lead.won_deal_value || 0), 0),
    destinations: Array.from(new Set(rows.map((lead) => lead.destination).filter((value): value is string => Boolean(value)))).sort(),
    stage_counts: rows.reduce<Record<string, number>>((counts, lead) => {
      counts[lead.stage] = (counts[lead.stage] || 0) + 1;
      return counts;
    }, {}),
  };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Lead profile check failed:', profileError.message);
    return NextResponse.json({ error: 'Unable to verify your account.' }, { status: 503 });
  }
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
  if (input.channel !== 'ALL') {
    if (input.channel === 'legacy') {
      query = query.is('source_channel', null);
    } else {
      query = query.eq('source_channel', input.channel);
    }
  }

  const term = safeFilterTerm(input.q);
  if (term) {
    const pattern = `%${term}%`;
    query = query.or(
      `customer_name.ilike.${pattern},lead_code.ilike.${pattern},destination.ilike.${pattern},customer_phone.ilike.${pattern},customer_email.ilike.${pattern},source.ilike.${pattern}`
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

  let summary = summaryResult.data || {};
  let summarySource: 'rpc' | 'fallback' = 'rpc';
  if (summaryResult.error) {
    console.warn('Lead summary RPC unavailable; using compatibility summary:', summaryResult.error.message);
    try {
      summary = await buildSummaryFallback(supabase, user.id);
      summarySource = 'fallback';
    } catch (fallbackError) {
      console.error('Lead summary fallback failed:', fallbackError);
      summary = {
        visible_count: leadResult.count || 0,
        my_count: 0,
        pending_sla_count: 0,
        overdue_count: 0,
        won_count: 0,
        won_value: 0,
        destinations: [],
        stage_counts: {},
      };
      summarySource = 'fallback';
    }
  }

  const total = leadResult.count || 0;
  return NextResponse.json(
    {
      items: leadResult.data || [],
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      summary,
      summarySource,
      migrationRequired: Boolean(summaryResult.error),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

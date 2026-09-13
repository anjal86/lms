import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

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

const CreateLeadSchema = z.object({
  customerName: z.string().trim().min(1).max(160),
  customerPhone: z.string().trim().max(64).default(''),
  customerEmail: z.union([z.literal(''), z.string().trim().email().max(254)]).default(''),
  customerCity: z.string().trim().max(120).default(''),
  customerCountry: z.string().trim().max(120).default(''),
  source: z.string().trim().min(1).max(80).default('website'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  assignedTo: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  notes: z.string().trim().max(5000).default(''),
  customData: z.record(z.string(), z.unknown()).default({}),
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

type DynamicField = {
  field_key: string;
  field_type: string;
  is_required: boolean;
  options: unknown;
  default_value: unknown;
};

function safeFilterTerm(value: string) {
  return value.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isEmptyValue(value: unknown) {
  return value == null
    || value === ''
    || (Array.isArray(value) && value.length === 0);
}

function normalizeDynamicValue(field: DynamicField, value: unknown) {
  if (isEmptyValue(value)) return field.default_value ?? null;

  if (['number', 'currency', 'percentage', 'rating'].includes(field.field_type)) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`${field.field_key} must be a number.`);
    return numeric;
  }

  if (field.field_type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`${field.field_key} must be true or false.`);
  }

  if (field.field_type === 'multi_select') {
    if (!Array.isArray(value)) throw new Error(`${field.field_key} must contain a list of values.`);
    const normalized = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 100);
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    if (options.length && normalized.some((item) => !options.includes(item))) {
      throw new Error(`${field.field_key} contains an unsupported option.`);
    }
    return normalized;
  }

  const text = String(value).trim().slice(0, field.field_type === 'textarea' ? 10000 : 1000);
  if (field.field_type === 'single_select') {
    const options = Array.isArray(field.options) ? field.options.map(String) : [];
    if (options.length && !options.includes(text)) throw new Error(`${field.field_key} contains an unsupported option.`);
  }
  return text;
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

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const parsed = CreateLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid lead details.' }, { status: 400 });
  }

  try {
    const [workspaceResult, fieldsResult, pipelineResult] = await Promise.all([
      actor.supabase
        .from('workspaces')
        .select('id,business_type')
        .eq('id', actor.profile.workspace_id)
        .single(),
      actor.supabase
        .from('field_definitions')
        .select('field_key,field_type,is_required,options,default_value')
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('entity_type', 'lead')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      actor.supabase
        .from('pipelines')
        .select('id')
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('entity_type', 'lead')
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle(),
    ]);
    if (workspaceResult.error || !workspaceResult.data) throw workspaceResult.error || new Error('Workspace unavailable.');
    if (fieldsResult.error) throw fieldsResult.error;
    if (pipelineResult.error) throw pipelineResult.error;

    const fields = (fieldsResult.data || []) as DynamicField[];
    const supplied = asRecord(parsed.data.customData);
    const normalizedCustomData: Record<string, unknown> = {};

    for (const field of fields) {
      const value = normalizeDynamicValue(field, supplied[field.field_key]);
      if (field.is_required && isEmptyValue(value)) {
        return NextResponse.json({ error: `${field.field_key.replaceAll('_', ' ')} is required.` }, { status: 400 });
      }
      if (!isEmptyValue(value)) normalizedCustomData[field.field_key] = value;
    }

    let pipelineStageId: string | null = null;
    if (pipelineResult.data?.id) {
      const { data: firstStage, error: stageError } = await actor.supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', pipelineResult.data.id)
        .eq('stage_type', 'open')
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (stageError) throw stageError;
      pipelineStageId = firstStage?.id || null;
    }

    let assignedTo: string | null = null;
    if (actor.profile.role === 'agent') {
      assignedTo = actor.user.id;
    } else if (parsed.data.assignedTo) {
      const { data: requestedAgent, error: requestedAgentError } = await actor.supabase
        .from('profiles')
        .select('id')
        .eq('id', parsed.data.assignedTo)
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('role', 'agent')
        .eq('is_active', true)
        .maybeSingle();
      if (requestedAgentError) throw requestedAgentError;
      if (!requestedAgent) return NextResponse.json({ error: 'Selected assignee is not available in this workspace.' }, { status: 400 });
      assignedTo = requestedAgent.id;
    } else if (isManagement(actor.profile)) {
      const { data: candidates, error: candidatesError } = await actor.supabase
        .from('profiles')
        .select('id,current_load,max_capacity,status,accepting_leads')
        .eq('workspace_id', actor.profile.workspace_id)
        .eq('role', 'agent')
        .eq('is_active', true)
        .eq('accepting_leads', true)
        .order('current_load', { ascending: true })
        .limit(25);
      if (candidatesError) throw candidatesError;
      const candidate = (candidates || [])
        .filter((item) => item.status === 'available' && Number(item.current_load || 0) < Number(item.max_capacity || 1))
        .sort((a, b) => (Number(a.current_load || 0) / Math.max(1, Number(a.max_capacity || 1))) - (Number(b.current_load || 0) / Math.max(1, Number(b.max_capacity || 1))))[0];
      assignedTo = candidate?.id || null;
    }

    const businessType = workspaceResult.data.business_type;
    const travel = businessType === 'travel';
    const destination = travel
      ? String(normalizedCustomData.destination || 'Unspecified')
      : String(
          normalizedCustomData.study_destination
          || normalizedCustomData.service_interest
          || normalizedCustomData.interest
          || 'General enquiry'
        );

    const row = {
      workspace_id: actor.profile.workspace_id,
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone,
      customer_email: parsed.data.customerEmail || null,
      customer_city: parsed.data.customerCity || null,
      customer_country: parsed.data.customerCountry || null,
      destination,
      travel_dates: travel ? String(normalizedCustomData.travel_dates || 'Flexible dates') : null,
      duration_days: travel ? Math.max(1, Number(normalizedCustomData.duration_days || 5)) : 1,
      pax_adults: travel ? Math.max(0, Number(normalizedCustomData.pax_adults ?? 2)) : 1,
      pax_children: travel ? Math.max(0, Number(normalizedCustomData.pax_children || 0)) : 0,
      pax_infants: 0,
      travel_type: travel ? String(normalizedCustomData.travel_type || 'family') : 'custom',
      budget_range: normalizedCustomData.budget_range != null
        ? String(normalizedCustomData.budget_range)
        : normalizedCustomData.project_budget != null
          ? String(normalizedCustomData.project_budget)
          : normalizedCustomData.budget != null
            ? String(normalizedCustomData.budget)
            : null,
      hotel_category: travel && normalizedCustomData.hotel_category != null ? String(normalizedCustomData.hotel_category) : null,
      flight_required: travel,
      visa_required: false,
      special_notes: parsed.data.notes || null,
      source: parsed.data.source,
      stage: 'new',
      priority: parsed.data.priority,
      assigned_to: assignedTo,
      assigned_by: assignedTo ? actor.user.id : null,
      custom_data: normalizedCustomData,
      pipeline_id: pipelineResult.data?.id || null,
      pipeline_stage_id: pipelineStageId,
    };

    const { data: created, error: createError } = await actor.supabase
      .from('leads')
      .insert(row)
      .select('*')
      .single();
    if (createError || !created) throw createError || new Error('Lead was not created.');

    return NextResponse.json({ lead: created }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Workspace lead creation failed:', error);
    return NextResponse.json({ error: 'Unable to create the lead.' }, { status: 500 });
  }
}

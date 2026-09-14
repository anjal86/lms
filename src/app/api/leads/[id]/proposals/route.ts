import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  packageTitle: z.string().trim().min(1).max(240),
  quoteNumber: z.string().trim().max(120).optional().nullable(),
  totalSellingPrice: z.coerce.number().min(0).optional().nullable(),
  totalSupplierCost: z.coerce.number().min(0).optional().nullable(),
  terms: z.string().trim().max(12000).optional().nullable(),
  parentRevisionId: z.string().trim().max(200).optional().nullable(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const { data, error } = await actor.supabase
    .from('lead_quotes')
    .select('lead_id,id,quote_number,package_title,status,total_selling_price,total_supplier_cost,gross_profit,profit_margin_pct,commission_earned,version,parent_revision_id,sent_at,viewed_at,accepted_at,rejected_at,terms,created_at,updated_at,payload')
    .eq('lead_id', id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load proposals.' }, { status: 500 });
  return NextResponse.json({ proposals: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid proposal.' }, { status: 400 });
  const input = parsed.data;

  const { data: lead, error: leadError } = await actor.supabase
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', actor.profile.workspace_id)
    .maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Unable to validate opportunity.' }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 });

  const recordId = crypto.randomUUID();
  const selling = input.totalSellingPrice ?? null;
  const supplier = input.totalSupplierCost ?? null;
  const grossProfit = selling != null && supplier != null ? selling - supplier : null;
  const margin = selling && grossProfit != null ? (grossProfit / selling) * 100 : null;
  const now = new Date().toISOString();
  const payload = {
    id: recordId,
    quote_number: input.quoteNumber || null,
    package_title: input.packageTitle,
    status: 'draft',
    total_selling_price: selling,
    total_supplier_cost: supplier,
    gross_profit: grossProfit,
    profit_margin_pct: margin,
    parent_revision_id: input.parentRevisionId || null,
    terms: input.terms || null,
    created_at: now,
  };

  if (input.parentRevisionId) {
    const { data, error } = await actor.supabase.rpc('create_proposal_revision', {
      p_lead_id: id,
      p_parent_revision_id: input.parentRevisionId,
      p_id: recordId,
      p_quote_number: input.quoteNumber || null,
      p_package_title: input.packageTitle,
      p_total_selling_price: selling,
      p_total_supplier_cost: supplier,
      p_terms: input.terms || null,
      p_payload: payload,
    });

    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Parent proposal not found.' }, { status: 404 });
      if (error.code === '23505') return NextResponse.json({ error: 'This proposal already has a newer revision.' }, { status: 409 });
      if (error.code === '23514') return NextResponse.json({ error: error.message || 'This proposal cannot be revised.' }, { status: 409 });
      if (error.code === '42501') return NextResponse.json({ error: 'Opportunity not found or unavailable.' }, { status: 404 });
      console.error('Proposal revision create failed:', error.message);
      return NextResponse.json({ error: 'Unable to create proposal revision.' }, { status: 500 });
    }

    return NextResponse.json({ proposal: data }, { status: 201 });
  }

  const { data, error } = await actor.supabase
    .from('lead_quotes')
    .insert({
      lead_id: id,
      id: recordId,
      quote_number: input.quoteNumber || null,
      package_title: input.packageTitle,
      status: 'draft',
      total_selling_price: selling,
      total_supplier_cost: supplier,
      gross_profit: grossProfit,
      profit_margin_pct: margin,
      version: 1,
      parent_revision_id: null,
      terms: input.terms || null,
      created_at: now,
      updated_at: now,
      payload: { ...payload, version: 1 },
    })
    .select('*')
    .single();
  if (error) {
    console.error('Proposal create failed:', error.message);
    return NextResponse.json({ error: 'Unable to create proposal.' }, { status: 500 });
  }
  return NextResponse.json({ proposal: data }, { status: 201 });
}

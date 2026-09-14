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

  let version = 1;
  if (input.parentRevisionId) {
    const { data: parent } = await actor.supabase
      .from('lead_quotes')
      .select('version')
      .eq('lead_id', id)
      .eq('id', input.parentRevisionId)
      .maybeSingle();
    if (parent) version = Number(parent.version || 1) + 1;
  }

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
    version,
    parent_revision_id: input.parentRevisionId || null,
    terms: input.terms || null,
    created_at: now,
  };

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
      version,
      parent_revision_id: input.parentRevisionId || null,
      terms: input.terms || null,
      created_at: now,
      updated_at: now,
      payload,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: 'Unable to create proposal.' }, { status: 500 });
  return NextResponse.json({ proposal: data }, { status: 201 });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'rejected']).optional(),
  packageTitle: z.string().trim().min(1).max(240).optional(),
  quoteNumber: z.string().trim().max(120).nullable().optional(),
  totalSellingPrice: z.coerce.number().min(0).nullable().optional(),
  totalSupplierCost: z.coerce.number().min(0).nullable().optional(),
  terms: z.string().trim().max(12000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied.' });

type Context = { params: Promise<{ id: string; proposalId: string }> };

const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(['sent']),
  sent: new Set(['viewed', 'accepted', 'rejected']),
  viewed: new Set(['accepted', 'rejected']),
  accepted: new Set(),
  rejected: new Set(),
  revised: new Set(),
};

export async function PATCH(request: Request, context: Context) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  const { id, proposalId } = await context.params;
  if (!uuidSchema.safeParse(id).success) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid proposal update.' }, { status: 400 });
  const input = parsed.data;

  const { data: existing, error: existingError } = await actor.supabase
    .from('lead_quotes')
    .select('*')
    .eq('lead_id', id)
    .eq('id', proposalId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: 'Unable to load proposal.' }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });

  const currentStatus = String(existing.status || 'draft');
  const nextStatus = input.status ?? currentStatus;
  if (input.status && input.status !== currentStatus) {
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? new Set<string>();
    if (!allowed.has(input.status)) {
      return NextResponse.json({
        error: `Proposal cannot move from ${currentStatus} to ${input.status}. Create a revision when commercial terms need to change after sending.`,
        code: 'INVALID_PROPOSAL_TRANSITION',
      }, { status: 409 });
    }
  }

  const editsCommercialTerms = input.packageTitle !== undefined
    || input.quoteNumber !== undefined
    || input.totalSellingPrice !== undefined
    || input.totalSupplierCost !== undefined
    || input.terms !== undefined;
  if (editsCommercialTerms && currentStatus !== 'draft') {
    return NextResponse.json({
      error: 'Sent proposals are immutable. Create a revision to change commercial terms.',
      code: 'PROPOSAL_REVISION_REQUIRED',
    }, { status: 409 });
  }

  const selling = input.totalSellingPrice !== undefined ? input.totalSellingPrice : existing.total_selling_price;
  const supplier = input.totalSupplierCost !== undefined ? input.totalSupplierCost : existing.total_supplier_cost;
  const grossProfit = selling != null && supplier != null ? Number(selling) - Number(supplier) : existing.gross_profit;
  const margin = selling && grossProfit != null ? (Number(grossProfit) / Number(selling)) * 100 : existing.profit_margin_pct;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) patch.status = input.status;
  if (input.packageTitle !== undefined) patch.package_title = input.packageTitle;
  if (input.quoteNumber !== undefined) patch.quote_number = input.quoteNumber;
  if (input.totalSellingPrice !== undefined) patch.total_selling_price = input.totalSellingPrice;
  if (input.totalSupplierCost !== undefined) patch.total_supplier_cost = input.totalSupplierCost;
  if (input.terms !== undefined) patch.terms = input.terms;
  patch.gross_profit = grossProfit;
  patch.profit_margin_pct = margin;
  patch.payload = {
    ...(existing.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload) ? existing.payload : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.packageTitle !== undefined ? { package_title: input.packageTitle } : {}),
    ...(input.quoteNumber !== undefined ? { quote_number: input.quoteNumber } : {}),
    ...(input.totalSellingPrice !== undefined ? { total_selling_price: input.totalSellingPrice } : {}),
    ...(input.totalSupplierCost !== undefined ? { total_supplier_cost: input.totalSupplierCost } : {}),
    ...(input.terms !== undefined ? { terms: input.terms } : {}),
    gross_profit: grossProfit,
    profit_margin_pct: margin,
  };

  const { data, error } = await actor.supabase
    .from('lead_quotes')
    .update(patch)
    .eq('lead_id', id)
    .eq('id', proposalId)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23514') return NextResponse.json({ error: error.message || 'Invalid proposal lifecycle change.' }, { status: 409 });
    console.error('Proposal update failed:', error.message);
    return NextResponse.json({ error: 'Unable to update proposal.' }, { status: 500 });
  }
  return NextResponse.json({ proposal: data, previousStatus: currentStatus, status: nextStatus });
}

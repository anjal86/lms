import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const TierSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  min_sales: z.number().min(0).max(1_000_000_000),
  max_sales: z.number().min(0).max(1_000_000_000).nullable(),
  commission_pct_profit: z.number().min(0).max(100),
  milestone_bonus: z.number().min(0).max(100_000_000),
  min_margin_threshold: z.number().min(0).max(100),
  perk_description: z.string().trim().max(500).optional(),
});

const PayloadSchema = z.object({
  tiers: z.array(TierSchema).min(1).max(20),
});

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single();

  if (!actor?.is_active || actor.role !== 'admin') {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed.', fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const tiers = [...parsed.data.tiers].sort((a, b) => a.min_sales - b.min_sales);
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (tier.max_sales !== null && tier.max_sales <= tier.min_sales) {
      return NextResponse.json({ error: `${tier.name}: max_sales must exceed min_sales.` }, { status: 400 });
    }
    const next = tiers[index + 1];
    if (next && tier.max_sales !== null && tier.max_sales > next.min_sales) {
      return NextResponse.json({ error: `${tier.name} overlaps the next incentive tier.` }, { status: 400 });
    }
  }

  const admin = createSupabaseAdminClient();
  const ids = tiers.map((tier) => tier.id);
  const { error: upsertError } = await admin
    .from('incentive_tiers')
    .upsert(tiers, { onConflict: 'id' });
  if (upsertError) {
    console.error('Incentive tier update failed:', upsertError.message);
    return NextResponse.json({ error: 'Unable to save incentive tiers.' }, { status: 500 });
  }

  const { error: cleanupError } = await admin
    .from('incentive_tiers')
    .delete()
    .not('id', 'in', `(${ids.map((id) => `"${id.replaceAll('"', '')}"`).join(',')})`);

  if (cleanupError) {
    console.error('Incentive tier cleanup failed:', cleanupError.message);
    return NextResponse.json({ error: 'Tiers saved, but stale tiers could not be removed.' }, { status: 500 });
  }

  return NextResponse.json({ tiers });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MergeSchema = z.object({
  primary_contact_id: z.string().uuid(),
  duplicate_contact_id: z.string().uuid(),
}).refine((value) => value.primary_contact_id !== value.duplicate_contact_id, {
  message: 'Choose two different contacts.',
});

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const parsed = MergeSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed.', details: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await actor.supabase.rpc('merge_contacts', {
    p_primary_contact_id: parsed.data.primary_contact_id,
    p_duplicate_contact_id: parsed.data.duplicate_contact_id,
  });

  if (error) {
    console.error('Contact merge failed:', error.message);
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
    return NextResponse.json({ error: error.message || 'Unable to merge contacts.' }, { status });
  }

  return NextResponse.json({ contact: data });
}

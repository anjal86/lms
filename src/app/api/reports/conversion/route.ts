import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { data, error } = await actor.supabase.rpc('crm_conversion_summary');
  if (error) {
    console.error('Conversion summary failed:', error.message);
    return NextResponse.json({ error: 'Unable to load conversion summary.' }, { status: 500 });
  }
  return NextResponse.json({ summary: data || {} }, { headers: { 'Cache-Control': 'private, no-store' } });
}

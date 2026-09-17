import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthenticatedActor = Exclude<Awaited<ReturnType<typeof getApiActor>>, { error: unknown }>;

const SaveSchema = z.object({
  id: uuidSchema.nullable().optional(),
  name: z.string().trim().min(1).max(80),
  team_key: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().default(true),
  member_ids: z.array(uuidSchema).max(100).default([]),
});

async function readTeams(actor: AuthenticatedActor) {
  const { data, error } = await actor.supabase
    .from('conversation_teams')
    .select('id,workspace_id,team_key,name,description,is_active,sort_order,created_at,updated_at,members:conversation_team_members(user_id,is_active)')
    .eq('workspace_id', actor.profile.workspace_id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  try {
    return NextResponse.json({ teams: await readTeams(actor) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Load conversation teams failed:', error);
    return NextResponse.json({ error: 'Unable to load conversation teams.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!isManagement(actor.profile)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

  const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid team configuration.', details: parsed.error.flatten() }, { status: 400 });

  const input = parsed.data;
  const { data: teamId, error } = await actor.supabase.rpc('save_conversation_team', {
    p_team_id: input.id ?? null,
    p_name: input.name,
    p_team_key: input.team_key,
    p_description: input.description ?? null,
    p_is_active: input.is_active,
    p_member_ids: input.member_ids,
  });

  if (error) {
    console.error('Save conversation team failed:', error.message);
    const status = error.code === '23505' ? 409 : error.code === '42501' ? 403 : error.code === '23514' || error.code === '22023' ? 400 : 500;
    return NextResponse.json({ error: error.code === '23505' ? 'That team key is already in use.' : error.message || 'Unable to save conversation team.' }, { status });
  }

  try {
    return NextResponse.json({ team_id: teamId, teams: await readTeams(actor) });
  } catch (readError) {
    console.error('Reload conversation teams failed:', readError);
    return NextResponse.json({ team_id: teamId });
  }
}

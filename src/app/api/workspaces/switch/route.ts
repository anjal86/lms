import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uuidSchema } from '@/lib/validation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SwitchSchema = z.object({
  workspaceId: uuidSchema,
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const parsed = SwitchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid workspace is required.' }, { status: 400 });
  }

  const { data: role, error } = await supabase.rpc('switch_workspace', {
    p_workspace_id: parsed.data.workspaceId,
  });

  if (error) {
    const message = error.message?.includes('membership') ? 'You do not have access to this workspace.' : 'Unable to switch workspace.';
    return NextResponse.json({ error: message }, { status: error.message?.includes('membership') ? 403 : 500 });
  }

  return NextResponse.json(
    { workspaceId: parsed.data.workspaceId, role },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

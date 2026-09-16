import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { getIntegrationSyncJobStatus } from '@/lib/redis/integration-sync-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid sync job ID.' }, { status: 400 });
  }

  const status = await getIntegrationSyncJobStatus(id).catch(() => null);
  if (!status || status.workspaceId !== actor.profile.workspace_id) {
    return NextResponse.json({ error: 'Sync job not found.' }, { status: 404 });
  }

  return NextResponse.json({ job: status }, { headers: { 'Cache-Control': 'no-store' } });
}

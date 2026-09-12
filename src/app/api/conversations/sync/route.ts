import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getApiActor, isManagement } from '@/lib/auth/api-actor';
import { refreshMetaConversationProfiles, syncMetaConversations } from '@/lib/integrations/meta-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeSecretMatch(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const internalSync = safeSecretMatch(
    request.headers.get('x-integration-sync-secret'),
    process.env.INTEGRATION_SYNC_SECRET?.trim()
  );

  if (!internalSync) {
    const actor = await getApiActor(request);
    if ('error' in actor) return actor.error;
    if (!isManagement(actor.profile)) {
      return NextResponse.json({ error: 'Only managers can run provider history sync.' }, { status: 403 });
    }
  }

  try {
    const result = await syncMetaConversations();
    const avatarRefresh = internalSync
      ? null
      : await refreshMetaConversationProfiles({ limit: 500 });

    return NextResponse.json(
      {
        ...result,
        avatarsRefreshed: avatarRefresh?.updated || 0,
        avatarProfilesAttempted: avatarRefresh?.attempted || 0,
        avatarProfilesUnavailable: avatarRefresh?.unavailable || 0,
        avatarErrors: avatarRefresh?.errors || [],
      },
      { status: result.success ? 200 : 502 }
    );
  } catch (error) {
    console.error('Meta conversation sync failed:', error);
    return NextResponse.json({ success: false, error: 'Meta conversation sync failed.' }, { status: 500 });
  }
}

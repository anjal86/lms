import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS = new Set(['facebook', 'instagram', 'whatsapp', 'tiktok', 'email', 'website', 'api']);

function sanitizeUuid(value: string | null) {
  const trimmed = value?.trim() || '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function sanitizeProvider(value: string | null) {
  const provider = (value || '').trim().toLowerCase();
  if (!provider || provider === 'all') return null;
  return PROVIDERS.has(provider) ? provider : null;
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  const url = new URL(request.url);
  const rawAccountId = url.searchParams.get('accountId');
  const rawProvider = url.searchParams.get('provider');
  const accountId = sanitizeUuid(rawAccountId);
  const provider = sanitizeProvider(rawProvider);

  if (rawAccountId && rawAccountId !== 'all' && !accountId) {
    return NextResponse.json({ error: 'Invalid channel account.' }, { status: 400 });
  }
  if (rawProvider && rawProvider !== 'all' && !provider) {
    return NextResponse.json({ error: 'Invalid channel provider.' }, { status: 400 });
  }

  const { data, error } = await actor.supabase.rpc('inbox_queue_metrics', {
    p_workspace_id: actor.profile.workspace_id,
    p_account_id: accountId,
    p_provider: provider,
  });

  if (error) {
    console.error('Inbox queue metrics failed:', error.message);
    return NextResponse.json({ error: 'Unable to load Inbox counts.' }, { status: 500 });
  }

  const metrics = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return NextResponse.json({ metrics }, {
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Inbox-Metrics': 'verified',
    },
  });
}

import { NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/api-actor';
import { scanPhoneLeadHistoryBatch } from '@/lib/integrations/phone-lead-sync';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const pair of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (rawName !== name) continue;
    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return rawValue.join('=');
    }
  }
  return '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

async function resolveScope(request: Request, requestedProvider?: string, requestedAccountId?: string) {
  let provider = requestedProvider;
  let accountId = requestedAccountId;

  if (!provider || !accountId) {
    const cookieValue = readCookie(request, 'inbox_page_filter');
    if (cookieValue && cookieValue !== 'all') {
      const separator = cookieValue.indexOf(':');
      if (separator > 0) {
        provider = cookieValue.slice(0, separator);
        accountId = cookieValue.slice(separator + 1).trim();
      }
    }
  }

  if (!provider || !accountId) return null;
  if ((provider !== 'facebook' && provider !== 'instagram') || !/^[A-Za-z0-9:_-]{1,128}$/.test(accountId)) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: connections } = await admin
    .from('integration_connections')
    .select('id,provider,config')
    .eq('provider', provider)
    .in('status', ['connected', 'token_expiring']);

  for (const connection of connections || []) {
    const pages = rows(record(connection.config).pages);
    for (const page of pages) {
      const pageId = String(page.id || '');
      if (provider === 'facebook' && pageId === accountId) {
        return {
          provider: 'facebook' as const,
          accountId,
          connectionId: connection.id,
        };
      }
      if (provider === 'instagram') {
        const instagramId = String(record(page.instagram_business_account).id || '');
        if (instagramId === accountId) {
          return {
            provider: 'instagram' as const,
            accountId,
            connectionId: connection.id,
          };
        }
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine
  }

  const batchSize = Math.max(1, Math.min(Number(body.batchSize) || 25, 50));
  const timeBudgetMs = Math.max(2_000, Math.min(Number(body.timeBudgetMs) || 15_000, 30_000));
  const maxHistoryPages = Math.max(1, Math.min(Number(body.maxHistoryPages) || 2, 5));

  const scope = await resolveScope(
    request,
    typeof body.provider === 'string' ? body.provider : undefined,
    typeof body.accountId === 'string' ? body.accountId : undefined
  );

  try {
    const result = await scanPhoneLeadHistoryBatch({
      scope,
      batchSize,
      maxHistoryPages,
      timeBudgetMs,
      requestTimeoutMs: 3_000,
    });

    return NextResponse.json({
      success: true,
      ...result,
      scope: scope ? { provider: scope.provider, accountId: scope.accountId } : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Phone lead history scan failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Phone lead history scan failed.',
    }, { status: 500 });
  }
}

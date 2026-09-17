import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isRedisConfigured, redisPing } from '@/lib/redis/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createSupabaseAdminClient();
    const [{ error }, redisState] = await Promise.all([
      admin.from('agency_settings').select('id').limit(1),
      isRedisConfigured()
        ? redisPing().then(() => 'reachable' as const).catch(() => 'unreachable' as const)
        : Promise.resolve('not_configured' as const),
    ]);
    if (error) throw error;

    return NextResponse.json(
      {
        status: redisState === 'unreachable' ? 'degraded' : 'ok',
        database: 'reachable',
        redis: redisState,
        latency_ms: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'degraded',
        database: 'unreachable',
        redis: isRedisConfigured() ? 'unknown' : 'not_configured',
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

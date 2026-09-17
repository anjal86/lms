import { NextResponse } from 'next/server';
import { getApiActor, isPlatformSuperAdmin } from '@/lib/auth/api-actor';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function countRows(table: string, status?: string) {
  const admin = createSupabaseAdminClient();
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  if (status) query = query.eq('status', status);
  const { count, error } = await query;
  return { count: error ? null : (count || 0), error: error?.message || null };
}

export async function GET(request: Request) {
  const actor = await getApiActor(request);
  if ('error' in actor) return actor.error;
  if (!(await isPlatformSuperAdmin(actor))) {
    return NextResponse.json({ error: 'Platform super-admin access required.' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const [workspaceProbe, aiQueued, aiProcessing, aiFailed, metaQueued, metaProcessing, metaFailed, providerRows] = await Promise.all([
    admin.from('workspaces').select('id', { count: 'exact', head: true }),
    countRows('ai_agent_jobs', 'queued'),
    countRows('ai_agent_jobs', 'processing'),
    countRows('ai_agent_jobs', 'failed'),
    countRows('meta_ad_enrichment_jobs', 'queued'),
    countRows('meta_ad_enrichment_jobs', 'processing'),
    countRows('meta_ad_enrichment_jobs', 'failed'),
    admin.from('ai_provider_configs').select('health_status'),
  ]);

  const providerHealth = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
  for (const row of providerRows.data || []) {
    const key = String(row.health_status || 'unknown') as keyof typeof providerHealth;
    if (key in providerHealth) providerHealth[key] += 1;
  }

  const configured = (value: string | undefined) => Boolean(value?.trim());
  const config = {
    supabase_service_role: configured(process.env.SUPABASE_SERVICE_ROLE_KEY),
    integration_encryption: configured(process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY),
    integration_worker_secret: configured(process.env.INTEGRATION_SYNC_SECRET),
    sla_worker_secret: configured(process.env.SLA_CRON_SECRET),
    meta_application: configured(process.env.META_APP_ID) && configured(process.env.META_APP_SECRET),
    meta_webhook_verification: configured(process.env.META_WEBHOOK_VERIFY_TOKEN),
    whatsapp_bridge: configured(process.env.WHATSAPP_BRIDGE_API_KEY) && configured(process.env.WHATSAPP_BRIDGE_WEBHOOK_SECRET),
    tiktok_application: configured(process.env.TIKTOK_APP_ID) && configured(process.env.TIKTOK_APP_SECRET),
  };

  return NextResponse.json({
    platform: {
      environment: process.env.NODE_ENV || 'unknown',
      database_connected: !workspaceProbe.error,
      workspace_count: workspaceProbe.error ? null : (workspaceProbe.count || 0),
      migration_level: 89,
    },
    configuration: config,
    queues: {
      ai: { queued: aiQueued.count, processing: aiProcessing.count, failed: aiFailed.count },
      meta_ads: { queued: metaQueued.count, processing: metaProcessing.count, failed: metaFailed.count },
    },
    provider_health: providerHealth,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

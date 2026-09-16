'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, CheckCircle2, Database, Loader2, RefreshCw, ServerCog, ShieldCheck, XCircle } from 'lucide-react';

type HealthPayload = {
  platform: { environment: string; database_connected: boolean; workspace_count: number | null; migration_level: number };
  configuration: Record<string, boolean>;
  queues: {
    ai: { queued: number | null; processing: number | null; failed: number | null };
    meta_ads: { queued: number | null; processing: number | null; failed: number | null };
  };
  provider_health: { healthy: number; degraded: number; unhealthy: number; unknown: number };
};

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-zinc-100 py-2.5 last:border-0"><span className="text-xs font-medium text-zinc-700">{label}</span><span className={`inline-flex items-center gap-1 text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{ok ? 'Configured' : 'Missing'}</span></div>;
}

export default function SystemSettingsPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/settings/system/health', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) { setForbidden(true); setHealth(null); return; }
      if (!response.ok) throw new Error(payload.error || 'Unable to load system health.');
      setForbidden(false);
      setHealth(payload as HealthPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load system health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (forbidden) {
    return <div className="mx-auto max-w-xl px-6 py-20 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-400" /><h1 className="mt-3 text-lg font-semibold">System access required</h1><p className="mt-1 text-sm text-zinc-500">Workspace administrator access does not grant installation-wide system privileges.</p><Link href="/settings" className="button-secondary mt-5 inline-flex"><ArrowLeft className="h-4 w-4" /> Settings</Link></div>;
  }

  return (
    <div className="app-page mx-auto max-w-6xl space-y-5">
      <header className="page-header">
        <div><p className="page-eyebrow">Platform</p><h1 className="page-title">System Settings</h1><p className="page-description">Installation-wide health and security state. Secrets remain environment-managed and are never displayed here.</p></div>
        <div className="page-actions"><Link href="/settings" className="button-secondary"><ArrowLeft className="h-4 w-4" /> Settings</Link><button type="button" onClick={() => void load()} className="button-secondary" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
      </header>

      {loading && !health ? <div className="surface-flat flex items-center justify-center gap-2 py-20 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading system health…</div> : error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : health && <>
        <div className="grid gap-4 md:grid-cols-3">
          <section className="surface-flat p-5"><ServerCog className="h-5 w-5 text-zinc-600" /><div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Environment</div><div className="mt-1 text-xl font-semibold capitalize text-zinc-950">{health.platform.environment}</div><p className="mt-1 text-xs text-zinc-500">Migration level {health.platform.migration_level}</p></section>
          <section className="surface-flat p-5"><Database className="h-5 w-5 text-zinc-600" /><div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Database</div><div className="mt-1 text-xl font-semibold text-zinc-950">{health.platform.database_connected ? 'Connected' : 'Unavailable'}</div><p className="mt-1 text-xs text-zinc-500">{health.platform.workspace_count == null ? 'Workspace count unavailable' : `${health.platform.workspace_count} workspaces`}</p></section>
          <section className="surface-flat p-5"><Activity className="h-5 w-5 text-zinc-600" /><div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">AI providers</div><div className="mt-1 text-xl font-semibold text-zinc-950">{health.provider_health.healthy} healthy</div><p className="mt-1 text-xs text-zinc-500">{health.provider_health.degraded} degraded · {health.provider_health.unhealthy} unhealthy · {health.provider_health.unknown} unknown</p></section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="surface-flat p-5">
            <div><h2 className="section-heading">Security & integrations</h2><p className="section-description mt-1">Presence checks only. Credential values never leave the server.</p></div>
            <div className="mt-4">
              <ConfigRow label="Supabase service role" ok={health.configuration.supabase_service_role} />
              <ConfigRow label="Integration encryption key" ok={health.configuration.integration_encryption} />
              <ConfigRow label="Integration worker authentication" ok={health.configuration.integration_worker_secret} />
              <ConfigRow label="SLA worker authentication" ok={health.configuration.sla_worker_secret} />
              <ConfigRow label="Meta application" ok={health.configuration.meta_application} />
              <ConfigRow label="Meta webhook verification" ok={health.configuration.meta_webhook_verification} />
              <ConfigRow label="WhatsApp bridge" ok={health.configuration.whatsapp_bridge} />
              <ConfigRow label="TikTok application" ok={health.configuration.tiktok_application} />
            </div>
          </section>

          <section className="surface-flat p-5">
            <div><h2 className="section-heading">Background operations</h2><p className="section-description mt-1">Durable worker queues across all workspaces.</p></div>
            <div className="mt-5 space-y-3">
              <div className="rounded-lg border border-zinc-200 p-4"><div className="text-sm font-semibold text-zinc-900">AI agent jobs</div><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-zinc-50 p-2"><div className="font-semibold text-zinc-900">{health.queues.ai.queued ?? '—'}</div><div className="text-zinc-400">Queued</div></div><div className="rounded-md bg-zinc-50 p-2"><div className="font-semibold text-zinc-900">{health.queues.ai.processing ?? '—'}</div><div className="text-zinc-400">Processing</div></div><div className="rounded-md bg-zinc-50 p-2"><div className="font-semibold text-zinc-900">{health.queues.ai.failed ?? '—'}</div><div className="text-zinc-400">Failed</div></div></div></div>
              <div className="rounded-lg border border-zinc-200 p-4"><div className="text-sm font-semibold text-zinc-900">Meta ad enrichment</div><div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-md bg-zinc-50 p-2"><div className="font-semibold text-zinc-900">{health.queues.meta_ads.queued ?? '—'}</div><div className="text-zinc-400">Queued</div></div><div className="rounded-md bg-zinc-50 p-2"><div className="font-semibold text-zinc-900">{health.queues.meta_ads.processing ?? '—'}</div><div className="text-zinc-400">Processing</div></div><div className="rounded-md bg-zinc-50 p-2"><div className="font-semibold text-zinc-900">{health.queues.meta_ads.failed ?? '—'}</div><div className="text-zinc-400">Failed</div></div></div></div>
            </div>
          </section>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600"><strong className="text-zinc-800">System boundary:</strong> this page is installation-wide and read-only. Workspace owners/admins do not inherit platform privileges. Platform administrators are provisioned separately with service-role tooling.</div>
      </>}
    </div>
  );
}

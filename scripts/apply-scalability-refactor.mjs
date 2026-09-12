import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function replace(path, search, replacement, label) {
  const source = read(path);
  if (!source.includes(search)) throw new Error(`Guard failed for ${label || path}`);
  write(path, source.replace(search, replacement));
}

// ---- store.tsx: avoid loading the entire CRM on server-backed screens ----
replace(
  'src/lib/store.tsx',
  "import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';\nimport { getSupabaseBrowserClient } from './supabase/client';",
  "import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';\nimport { usePathname } from 'next/navigation';\nimport { getSupabaseBrowserClient } from './supabase/client';",
  'store pathname import'
);
replace(
  'src/lib/store.tsx',
  "export function AppProvider({ children }: { children: React.ReactNode }) {\n  const [profiles, setProfiles] = useState<Profile[]>([]);",
  "export function AppProvider({ children }: { children: React.ReactNode }) {\n  const pathname = usePathname();\n  const useServerScopedData = pathname === '/dashboard' || pathname === '/leads' || pathname.startsWith('/team/users');\n  const [profiles, setProfiles] = useState<Profile[]>([]);",
  'store lightweight routes'
);
replace(
  'src/lib/store.tsx',
  "      supabase.from('leads').select('*').order('created_at', { ascending: false }),\n      supabase.from('follow_ups').select('*').order('scheduled_at', { ascending: true }),\n      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(2000),",
  "      useServerScopedData ? Promise.resolve({ data: [], error: null }) : supabase.from('leads').select('*').order('created_at', { ascending: false }),\n      useServerScopedData ? Promise.resolve({ data: [], error: null }) : supabase.from('follow_ups').select('*').order('scheduled_at', { ascending: true }),\n      useServerScopedData ? Promise.resolve({ data: [], error: null }) : supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(2000),",
  'store scoped hydration'
);
replace(
  'src/lib/store.tsx',
  "  }, []);\n\n  useEffect(() => {\n    let mounted = true;",
  "  }, [useServerScopedData]);\n\n  useEffect(() => {\n    let mounted = true;",
  'refreshData dependency'
);
replace(
  'src/lib/store.tsx',
  "  const profilesWithDynamicLoad = useMemo(() => profiles.map((profile) => ({\n    ...profile,\n    current_load: leadsList.filter((lead) => lead.assigned_to === profile.id && lead.stage !== 'won' && lead.stage !== 'lost').length,\n  })), [profiles, leadsList]);",
  "  const profilesWithDynamicLoad = useMemo(() => profiles.map((profile) => ({\n    ...profile,\n    current_load: useServerScopedData\n      ? profile.current_load\n      : leadsList.filter((lead) => lead.assigned_to === profile.id && lead.stage !== 'won' && lead.stage !== 'lost').length,\n  })), [profiles, leadsList, useServerScopedData]);",
  'profile load calculation'
);
replace(
  'src/lib/store.tsx',
  "  const run = useCallback((label: string, operation: PromiseLike<unknown>) => {\n    void Promise.resolve(operation).then((result: any) => {\n      if (result?.error) throw result.error;\n    }).catch((error) => {",
  "  const run = useCallback((label: string, operation: PromiseLike<unknown>) => {\n    void Promise.resolve(operation).then((result: any) => {\n      if (result?.error) throw result.error;\n      window.dispatchEvent(new CustomEvent('crm:data-mutated', { detail: { label } }));\n    }).catch((error) => {",
  'mutation refresh event'
);

// ---- leads/page.tsx: switch list + metrics to paginated server endpoint ----
replace(
  'src/app/leads/page.tsx',
  "import { useDialog } from '@/lib/useDialog';",
  "import { useDialog } from '@/lib/useDialog';\nimport { usePaginatedLeads } from '@/lib/usePaginatedLeads';",
  'leads hook import'
);
replace(
  'src/app/leads/page.tsx',
  "    leads,\n    allProfiles,",
  "    allProfiles,",
  'remove store leads'
);
replace(
  'src/app/leads/page.tsx',
  "  const selectedTripStatus  = params.get('trip')  || 'ALL';\n\n  const pushParam = useCallback((key: string, value: string) => {",
  "  const selectedTripStatus  = params.get('trip')  || 'ALL';\n  const parsedPage = Number(params.get('page') || '1');\n  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;\n  const pageSize = viewMode === 'kanban' ? 500 : 50;\n  const {\n    leads,\n    total,\n    totalPages,\n    summary,\n    isLoading: serverLoading,\n    error: serverError,\n  } = usePaginatedLeads({\n    page,\n    pageSize,\n    tab: selectedTab,\n    q: searchQuery,\n    dest: selectedDestination,\n    trip: selectedTripStatus,\n  });\n\n  const pushParam = useCallback((key: string, value: string) => {",
  'server lead hook'
);
replace(
  'src/app/leads/page.tsx',
  "    const next = new URLSearchParams(params.toString());\n    if (!value || value === 'ALL' || value === 'all' || value === 'table') {",
  "    const next = new URLSearchParams(params.toString());\n    if (key !== 'page') next.delete('page');\n    if (!value || value === 'ALL' || value === 'all' || value === 'table') {",
  'reset page on filter'
);
replace(
  'src/app/leads/page.tsx',
  `  // Top Metrics\n  const totalLeadsCount = leads.length;\n  const pendingSlaCount = leads.filter((l) => !l.first_contacted_at && l.stage === 'new').length;\n  const overdueFollowUpCount = leads.filter((l) => {\n    if (!l.next_follow_up_at) return false;\n    return new Date(l.next_follow_up_at).getTime() < Date.now() && l.stage !== 'won' && l.stage !== 'lost';\n  }).length;\n  const wonLeadsCount = leads.filter((l) => l.stage === 'won').length;\n  const wonValueSum = leads\n    .filter((l) => l.stage === 'won')\n    .reduce((sum, l) => sum + (l.won_deal_value || 0), 0);\n\n  const destinations = Array.from(new Set(leads.map((l) => l.destination))).filter(Boolean);`,
  `  // Metrics are aggregated server-side across every RLS-visible lead, not just the current page.\n  const totalLeadsCount = summary.visible_count;\n  const pendingSlaCount = summary.pending_sla_count;\n  const overdueFollowUpCount = summary.overdue_count;\n  const wonLeadsCount = summary.won_count;\n  const wonValueSum = summary.won_value;\n  const destinations = summary.destinations;`,
  'server pipeline metrics'
);
replace(
  'src/app/leads/page.tsx',
  "    if (selectedTab === 'sla_pending') return !lead.first_contacted_at;\n    return true;",
  "    if (selectedTab === 'sla_pending') return !lead.first_contacted_at;\n    if (selectedTab === 'won') return lead.stage === 'won';\n    return true;",
  'won tab filtering'
);
replace(
  'src/app/leads/page.tsx',
  "            { id: 'all', label: 'All Leads', count: totalLeadsCount },\n            { id: 'my', label: 'My Leads', count: leads.filter((l) => l.assigned_to === currentUser.id).length },\n            { id: 'overdue', label: 'Overdue', count: overdueFollowUpCount, alert: overdueFollowUpCount > 0 },\n            { id: 'sla_pending', label: 'Pending SLA', count: pendingSlaCount },\n            { id: 'won', label: 'Won', count: wonLeadsCount },",
  "            { id: 'all', label: 'All Leads', count: totalLeadsCount },\n            { id: 'my', label: 'My Leads', count: summary.my_count },\n            { id: 'overdue', label: 'Overdue', count: overdueFollowUpCount, alert: overdueFollowUpCount > 0 },\n            { id: 'sla_pending', label: 'Pending SLA', count: pendingSlaCount },\n            { id: 'won', label: 'Won', count: wonLeadsCount },",
  'server tab counts'
);
replace(
  'src/app/leads/page.tsx',
  "      {/* Main Content Area */}",
  `      {serverError && (\n        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">\n          {serverError}\n        </div>\n      )}\n\n      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">\n        <div>\n          {serverLoading ? 'Refreshing pipeline…' : viewMode === 'kanban'\n            ? \`Showing \${leads.length} of \${total} matching leads on this board\`\n            : \`Showing \${total === 0 ? 0 : (page - 1) * pageSize + 1}–\${Math.min(page * pageSize, total)} of \${total} matching leads\`}\n          {viewMode === 'kanban' && total > leads.length && (\n            <span className="ml-1 text-amber-700">Kanban is capped at the newest 500 matching leads; use Table for full pagination.</span>\n          )}\n        </div>\n        {viewMode === 'table' && (\n          <div className="flex items-center gap-2">\n            <button\n              type="button"\n              disabled={page <= 1 || serverLoading}\n              onClick={() => pushParam('page', String(page - 1))}\n              className="rounded border border-zinc-200 px-2 py-1 font-medium text-zinc-700 disabled:opacity-40"\n            >\n              Previous\n            </button>\n            <span className="font-mono text-zinc-500">Page {page} / {totalPages}</span>\n            <button\n              type="button"\n              disabled={page >= totalPages || serverLoading}\n              onClick={() => pushParam('page', String(page + 1))}\n              className="rounded border border-zinc-200 px-2 py-1 font-medium text-zinc-700 disabled:opacity-40"\n            >\n              Next\n            </button>\n          </div>\n        )}\n      </div>\n\n      {/* Main Content Area */}`,
  'pipeline pagination UI'
);

// ---- Sidebar: server-derived badges on lightweight routes + admin user management link ----
replace(
  'src/components/layout/Sidebar.tsx',
  "import React from 'react';",
  "import React, { useEffect, useState } from 'react';",
  'sidebar hooks import'
);
replace(
  'src/components/layout/Sidebar.tsx',
  "  const canViewSettings = canAccessSettings(currentUser.role);\n\n  const overdueCount = followUps.filter((fu) => {",
  "  const canViewSettings = canAccessSettings(currentUser.role);\n  const [serverCounts, setServerCounts] = useState<{ action: number; pipeline: number; breached: number; overdue: number } | null>(null);\n\n  useEffect(() => {\n    if (pathname !== '/dashboard' && pathname !== '/leads' && !pathname.startsWith('/team/users')) return;\n    let cancelled = false;\n    void fetch('/api/dashboard/summary', { cache: 'no-store' })\n      .then(async (response) => {\n        if (!response.ok) throw new Error('Navigation summary failed');\n        return response.json();\n      })\n      .then((payload) => {\n        if (cancelled) return;\n        const operational = payload.summary || {};\n        const pipeline = payload.pipelineSummary || {};\n        const breached = Number(operational.sla_breaches || 0);\n        const overdue = Number(operational.overdue_followups || 0);\n        setServerCounts({ action: breached + overdue, pipeline: Number(pipeline.visible_count || 0), breached, overdue });\n      })\n      .catch(() => undefined);\n    return () => { cancelled = true; };\n  }, [pathname]);\n\n  const overdueCount = followUps.filter((fu) => {",
  'sidebar server counts'
);
replace(
  'src/components/layout/Sidebar.tsx',
  "  const breachedSlaCount = leads.filter((l) => l.is_first_response_breached).length;\n  const actionCount = overdueCount + breachedSlaCount;",
  "  const localBreachedSlaCount = leads.filter((l) => l.is_first_response_breached).length;\n  const breachedSlaCount = serverCounts?.breached ?? localBreachedSlaCount;\n  const effectiveOverdueCount = serverCounts?.overdue ?? overdueCount;\n  const actionCount = serverCounts?.action ?? (overdueCount + localBreachedSlaCount);\n  const pipelineCount = serverCounts?.pipeline ?? leads.length;",
  'sidebar derived counts'
);
replace(
  'src/components/layout/Sidebar.tsx',
  "      badge: leads.length,",
  "      badge: pipelineCount,",
  'sidebar pipeline count'
);
replace(
  'src/components/layout/Sidebar.tsx',
  "      badge: followUps.filter((f) => f.status === 'pending').length,\n      alert: overdueCount > 0 ? `${overdueCount} overdue` : null,",
  "      badge: serverCounts ? effectiveOverdueCount : followUps.filter((f) => f.status === 'pending').length,\n      alert: effectiveOverdueCount > 0 ? `${effectiveOverdueCount} overdue` : null,",
  'sidebar followup count'
);
replace(
  'src/components/layout/Sidebar.tsx',
  "          {\n            label: 'Security Audit',",
  "          ...(currentUser.role === 'admin' ? [{\n            label: 'User Management',\n            href: '/team/users',\n            icon: Users,\n            badge: null,\n            alert: null,\n          }] : []),\n          {\n            label: 'Security Audit',",
  'admin user management nav'
);

// ---- package scripts ----
const packagePath = 'package.json';
const pkg = JSON.parse(read(packagePath));
pkg.scripts['test:db'] = 'bash scripts/test-migrations.sh';
pkg.scripts['test:e2e'] = 'playwright test';
write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

// ---- CI: execute SQL/RLS and browser smoke tests ----
replace(
  '.github/workflows/ci.yml',
  '    timeout-minutes: 15',
  '    timeout-minutes: 25',
  'CI timeout'
);
replace(
  '.github/workflows/ci.yml',
  "      - name: Validate Docker Compose\n        run: docker compose -f docker/docker-compose.yml config --quiet\n      - name: Lint",
  "      - name: Validate Docker Compose\n        run: docker compose -f docker/docker-compose.yml config --quiet\n      - name: Migration and RLS smoke test\n        run: npm run test:db\n      - name: Lint",
  'CI DB test'
);
replace(
  '.github/workflows/ci.yml',
  "      - name: Production build\n        run: npm run build",
  "      - name: Production build\n        run: npm run build\n      - name: Install Playwright Chromium\n        run: npx playwright install --with-deps chromium\n      - name: Browser smoke tests\n        run: npm run test:e2e",
  'CI browser tests'
);

console.log('Guarded scalability refactor applied.');

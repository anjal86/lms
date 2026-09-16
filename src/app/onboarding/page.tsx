'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronRight } from 'lucide-react';

const templates = [
  { key: 'generic', name: 'General business', description: 'A clean CRM for any company.' },
  { key: 'agency', name: 'Service agency', description: 'Prospects, proposals and projects.' },
  { key: 'health', name: 'Health & wellness', description: 'Inquiries, consultations and follow-up.' },
  { key: 'consultancy', name: 'Education consultancy', description: 'Students, applications and counseling.' },
  { key: 'travel', name: 'Travel & tours', description: 'Inquiries, quotations and trip operations.' },
] as const;

type TemplateKey = typeof templates[number]['key'];

export default function WorkspaceOnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('generic');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [hasWorkspace, setHasWorkspace] = useState(false);

  useEffect(() => {
    void fetch('/api/workspaces', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => setHasWorkspace(Boolean(payload?.workspaces?.length)))
      .catch(() => undefined);
  }, []);

  const createWorkspace = async () => {
    if (name.trim().length < 2 || creating) return;
    setCreating(true);
    setError('');
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), templateKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to create workspace.');
      window.location.assign('/connections');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create workspace.');
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-950">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Workspace setup</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create a company workspace</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              Each workspace is a separate company with its own team, channels, inbox, contacts and CRM data. Nothing is connected automatically.
            </p>
          </div>
          {hasWorkspace && (
            <button type="button" onClick={() => router.push('/dashboard')} className="button-secondary shrink-0">Back to CRM</button>
          )}
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="block text-xs font-semibold text-zinc-700">Company name</label>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void createWorkspace(); }}
            placeholder="e.g. Healthy Life Nepal"
            className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3.5 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
          />

          <div className="mt-6">
            <div className="text-xs font-semibold text-zinc-700">Business type</div>
            <p className="mt-1 text-xs text-zinc-400">This only sets the starting terminology and workflow. You can change it later.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {templates.map((template) => {
                const selected = templateKey === template.key;
                return (
                  <button
                    type="button"
                    key={template.key}
                    onClick={() => setTemplateKey(template.key)}
                    className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition ${selected ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/60'}`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-300 text-transparent'}`}>
                      <Check className="h-3 w-3" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-zinc-900">{template.name}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{template.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4">
            <p className="text-xs text-zinc-400">You will become the workspace owner. Next, connect the company's channels and invite its team.</p>
            <button
              type="button"
              onClick={() => void createWorkspace()}
              disabled={name.trim().length < 2 || creating}
              className="button-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create workspace'}
              {!creating && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_CLASS: Record<StatusTone, string> = {
  neutral: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[tone]}`}>{children}</span>;
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  tone = 'default',
  id,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
  id?: string;
}) {
  return (
    <section id={id} className={`overflow-hidden rounded-lg border bg-white ${tone === 'danger' ? 'border-red-200' : 'border-zinc-200'}`}>
      <div className={`flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${tone === 'danger' ? 'border-red-100 bg-red-50/40' : 'border-zinc-100'}`}>
        <div className="flex min-w-0 items-start gap-3">
          {Icon && <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone === 'danger' ? 'border-red-200 bg-white text-red-600' : 'border-zinc-200 bg-zinc-50 text-zinc-600'}`}><Icon className="h-4 w-4" /></span>}
          <div className="min-w-0">
            <h2 className={`text-sm font-semibold ${tone === 'danger' ? 'text-red-900' : 'text-zinc-950'}`}>{title}</h2>
            {description && <p className={`mt-1 max-w-3xl text-xs leading-5 ${tone === 'danger' ? 'text-red-700' : 'text-zinc-500'}`}>{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function FieldLabel({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-zinc-700">
      {label}
      {children}
      {hint && <span className="mt-1.5 block text-[11px] font-normal leading-4 text-zinc-500">{hint}</span>}
    </label>
  );
}

export function EmptyBlock({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400"><Icon className="h-5 w-5" /></span>
      <div className="mt-3 text-sm font-semibold text-zinc-800">{title}</div>
      <p className="mt-1 max-w-64 text-xs leading-5 text-zinc-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-2 text-xs text-zinc-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function InlineNotice({ children, tone = 'info' }: { children: ReactNode; tone?: StatusTone }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  return <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs leading-5 ${STATUS_CLASS[tone]}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function DirtySaveBar({ dirty, saving, onSave, label = 'Save changes' }: { dirty: boolean; saving: boolean; onSave: () => void; label?: string }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-4 rounded-lg border border-zinc-300 bg-white/95 px-4 py-3 shadow-lg shadow-zinc-950/10 backdrop-blur">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-zinc-900">Unsaved changes</div>
        <div className="mt-0.5 text-[11px] text-zinc-500">Save before leaving this page.</div>
      </div>
      <button type="button" onClick={onSave} disabled={saving} className="button-primary shrink-0">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel(); }}>
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><AlertTriangle className="h-4 w-4" /></span>
          <div>
            <h2 id="confirm-dialog-title" className="text-sm font-semibold text-zinc-950">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="button-danger" onClick={onConfirm} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

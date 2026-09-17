'use client';

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Search,
} from 'lucide-react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_CLASS: Record<StatusTone, string> = {
  neutral: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-zinc-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function useUnsavedChangesGuard(dirty: boolean, message = 'You have unsaved changes. Leave without saving?') {
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const guardInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      let next: URL;
      try {
        next = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (next.origin !== window.location.origin) return;
      const current = new URL(window.location.href);
      const sameDocument = next.pathname === current.pathname && next.search === current.search;
      if (sameDocument) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardInternalNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardInternalNavigation, true);
    };
  }, [dirty, message]);
}

export function StatusBadge({
  children,
  tone = 'neutral',
  dot = false,
  ariaLabel,
}: {
  children: ReactNode;
  tone?: StatusTone;
  dot?: boolean;
  ariaLabel?: string;
}) {
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[tone]}`}
      aria-label={ariaLabel}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[tone]}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
  actions,
  status,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="page-title">{title}</h1>
          {status}
        </div>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
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
  const generatedId = useId();
  const headingId = `${id || generatedId}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx(
        'settings-section overflow-hidden rounded-lg border bg-white',
        tone === 'danger' ? 'border-red-200' : 'border-zinc-200',
      )}
    >
      <div
        className={cx(
          'flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
          tone === 'danger' ? 'border-red-100 bg-red-50/40' : 'border-zinc-100',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span
              className={cx(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                tone === 'danger'
                  ? 'border-red-200 bg-white text-red-600'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-600',
              )}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={headingId} className={cx('text-sm font-semibold', tone === 'danger' ? 'text-red-900' : 'text-zinc-950')}>
              {title}
            </h2>
            {description && (
              <p className={cx('mt-1 max-w-3xl text-xs leading-5', tone === 'danger' ? 'text-red-700' : 'text-zinc-500')}>
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function DangerZone({
  title = 'Danger zone',
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <SettingsSection title={title} description={description} tone="danger">
      {children}
    </SettingsSection>
  );
}

export function SettingsRow({
  title,
  description,
  children,
  disabled = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cx('flex flex-col gap-3 border-b border-zinc-100 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between', disabled && 'opacity-60')}>
      <div className="min-w-0 sm:max-w-[58%]">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {description && <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>}
      </div>
      <div className="min-w-0 sm:w-[38%] sm:max-w-md">{children}</div>
    </div>
  );
}

export function FieldLabel({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;

  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-zinc-700">
      <span className="inline-flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-hidden="true">*</span>}
      </span>
      {children}
      {hint && !error && <span id={hintId} className="mt-1.5 block text-[11px] font-normal leading-4 text-zinc-500">{hint}</span>}
      {error && <span id={errorId} role="alert" className="mt-1.5 block text-[11px] font-medium leading-4 text-red-600">{error}</span>}
    </label>
  );
}

export function ToggleRow({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4', disabled && 'opacity-60')}>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-zinc-900">{title}</div>
        {description && <p className="mt-1 text-[11px] leading-4 text-zinc-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 focus-visible:ring-offset-2',
          checked ? 'border-blue-600 bg-blue-600' : 'border-zinc-300 bg-zinc-200',
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[1.3rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function SectionAnchorNav({
  items,
  label = 'On this page',
}: {
  items: Array<{ id: string; label: string }>;
  label?: string;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b border-zinc-100 pb-3 text-[11px]">
      <span className="mr-1 font-semibold text-zinc-500">{label}</span>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="rounded-md px-2 py-1 font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-950 focus-visible:bg-zinc-50 focus-visible:text-zinc-950"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  ariaLabel = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="field pl-9"
      />
    </div>
  );
}

export function EmptyBlock({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center" role="status">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400" aria-hidden="true"><Icon className="h-5 w-5" /></span>
      <div className="mt-3 text-sm font-semibold text-zinc-800">{title}</div>
      <p className="mt-1 max-w-72 text-xs leading-5 text-zinc-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading content" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-lg border border-zinc-100 bg-white p-4">
          <div className="h-3 w-1/3 rounded bg-zinc-200" />
          <div className="mt-3 h-2.5 w-4/5 rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-2 text-xs text-zinc-500" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </div>
  );
}

export function InlineNotice({ children, tone = 'info' }: { children: ReactNode; tone?: StatusTone }) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';
  return (
    <div role={role} className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs leading-5 ${STATUS_CLASS[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function DirtySaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  label = 'Save changes',
  message = 'Save before leaving this page.',
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  label?: string;
  message?: string;
}) {
  if (!dirty) return null;

  return (
    <div
      className="sticky bottom-3 z-20 mt-5 flex flex-col gap-3 rounded-lg border border-zinc-300 bg-white/95 px-4 py-3 shadow-lg shadow-zinc-950/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold text-zinc-900">Unsaved changes</div>
        <div className="mt-0.5 text-[11px] leading-4 text-zinc-500">{message}</div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {onDiscard && <button type="button" onClick={onDiscard} disabled={saving} className="button-secondary button-sm">Discard</button>}
        <button type="button" onClick={onSave} disabled={saving} className="button-primary shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} {label}
        </button>
      </div>
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
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => cancelRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onCancel(); }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600" aria-hidden="true"><AlertTriangle className="h-4 w-4" /></span>
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-zinc-950">{title}</h2>
            <p id={descriptionId} className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" className="button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="button-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsLinkRow({
  href,
  title,
  description,
  meta,
}: {
  href: string;
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <a href={href} className="group flex min-h-16 items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50 focus-visible:bg-zinc-50">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-900">{title}{meta}</span>
        {description && <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{description}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500" aria-hidden="true" />
    </a>
  );
}

import type { ReactNode } from 'react';

export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-b border-zinc-200 py-6 first:pt-0 last:border-b-0 last:pb-0 dark:border-zinc-800">
    <div className="mb-5"><h2 id={`${id}-title`} className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{title}</h2>{description && <p className="mt-1 text-[13px] leading-5 text-zinc-600 dark:text-zinc-400">{description}</p>}</div>
    {children}
  </section>;
}

export function FormField({ label, help, children, className = '' }: { label: string; help?: string; children: ReactNode; className?: string }) {
  return <label className={`block text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 ${className}`}>
    <span>{label}</span>
    <span className="mt-1.5 block">{children}</span>
    {help && <span className="mt-1 block text-[13px] font-normal leading-5 text-zinc-600 dark:text-zinc-400">{help}</span>}
  </label>;
}

export function SettingsToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-zinc-200 py-3 first:border-t-0 dark:border-zinc-800">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-zinc-950" />
    <span><span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{label}</span><span className="mt-0.5 block text-[13px] leading-5 text-zinc-600 dark:text-zinc-400">{description}</span></span>
  </label>;
}

export function StickySaveBar({ saving, onSave, onDiscard }: { saving: boolean; onSave: () => void; onDiscard: () => void }) {
  return <div role="status" aria-live="polite" className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-300 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
    <span className="flex items-center gap-2 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes</span>
    <div className="flex items-center gap-2"><button type="button" onClick={onDiscard} disabled={saving} className="button-secondary min-h-11">Discard</button><button type="button" onClick={onSave} disabled={saving} className="button-primary min-h-11">{saving ? 'Saving…' : 'Save changes'}</button></div>
  </div>;
}

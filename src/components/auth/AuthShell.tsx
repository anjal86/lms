import Link from 'next/link';
import { CheckCircle2, Layers3, ShieldCheck, Sparkles } from 'lucide-react';

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-zinc-950 lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-zinc-950 px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-14 xl:py-12">
        <div className="absolute inset-0 opacity-70" aria-hidden="true">
        </div>

        <div className="relative z-10">
          <Link href="/login" className="inline-flex items-center gap-3" aria-label="CRM workspace sign in">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-sm font-bold text-zinc-950 shadow-sm">C</span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">CRM Workspace</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Adaptive business CRM</span>
            </span>
          </Link>
        </div>

        <div className="relative z-10 max-w-md pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300">
            <Sparkles className="h-3.5 w-3.5 text-zinc-400" />
            Built around the way your business works
          </div>
          <h2 className="text-4xl font-semibold leading-[1.08] tracking-[-0.035em] xl:text-5xl">
            Move every customer conversation forward with less friction.
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-zinc-400">
            One secure workspace for conversations, ownership, configurable pipelines, follow-ups and business-specific operations.
          </p>

          <div className="mt-8 space-y-3 text-sm text-zinc-300">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-zinc-400" />
              Clear next actions for every customer record
            </div>
            <div className="flex items-center gap-3">
              <Layers3 className="h-4 w-4 text-zinc-400" />
              Fields, pipelines and modules that adapt to your business
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-zinc-300" />
              Role-based access and auditable activity
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-zinc-600">Secure business workspace</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/login" className="inline-flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-xs font-bold text-white">C</span>
              <span className="text-sm font-semibold tracking-tight">CRM Workspace</span>
            </Link>
          </div>

          <div className="mb-7">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{eyebrow}</div>
            <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-zinc-950">{title}</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">{description}</p>
          </div>

          {children}

          {footer && <div className="mt-6 text-sm text-zinc-500">{footer}</div>}
        </div>
      </section>
    </main>
  );
}

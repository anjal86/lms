'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';

export type SettingsIndexItem = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  visible?: boolean;
  meta?: string;
};

export function SettingsIndexGroup({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: SettingsIndexItem[];
}) {
  const visibleItems = items.filter((item) => item.visible !== false);
  if (!visibleItems.length) return null;

  return (
    <section>
      <div className="mb-2.5">
        <h2 className="text-[13px] font-semibold text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {visibleItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex min-h-[70px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 ${index > 0 ? 'border-t border-zinc-100' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-900">{item.title}</span>
                  {item.meta && <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">{item.meta}</span>}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{item.description}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-500" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

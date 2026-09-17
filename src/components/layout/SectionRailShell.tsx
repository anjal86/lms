'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import styles from './SectionRailShell.module.css';

type RailItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

type RailGroup = {
  label?: string;
  items: RailItem[];
};

type SectionRailShellProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  ariaLabel: string;
  mobileLabel: string;
  groups: RailGroup[];
  children: React.ReactNode;
  variant?: 'default' | 'admin' | 'ai';
};

function activeFor(pathname: string, item: RailItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function SectionRailShell({
  title,
  description,
  icon: SectionIcon,
  ariaLabel,
  mobileLabel,
  groups,
  children,
  variant = 'default',
}: SectionRailShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const items = groups.flatMap((group) => group.items);
  const current = items.find((item) => activeFor(pathname, item))?.href || items[0]?.href || '/';
  const variantClassName = variant === 'admin'
    ? styles.adminShell
    : variant === 'ai'
      ? styles.aiShell
      : '';
  const shellClassName = `${styles.shell} ${variantClassName}`;

  return (
    <div className={shellClassName}>
      <div className={styles.grid}>
        <aside className={styles.rail} aria-label={ariaLabel}>
          <div className={styles.railInner}>
            <div className={styles.railHeader}>
              <span className={styles.railIcon}><SectionIcon className="h-4 w-4" /></span>
              <h2 className={styles.railTitle}>{title}</h2>
              <p className={styles.railDescription}>{description}</p>
            </div>

            <nav className={styles.nav} aria-label={ariaLabel}>
              {groups.map((group, groupIndex) => (
                <div key={group.label || groupIndex} className={styles.group}>
                  {group.label && <div className={styles.groupLabel}>{group.label}</div>}
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeFor(pathname, item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`${styles.item} ${active ? styles.itemActive : ''}`}
                      >
                        <Icon className={styles.itemIcon} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <div className={styles.content}>
          <div className={styles.mobileNav}>
            <label className={styles.mobileLabel} htmlFor="section-navigation">{mobileLabel}</label>
            <select
              id="section-navigation"
              value={current}
              onChange={(event) => router.push(event.target.value)}
              className="select-field w-full bg-white"
            >
              {groups.map((group) => (
                <optgroup key={group.label || 'sections'} label={group.label || title}>
                  {group.items.map((item) => <option key={item.href} value={item.href}>{item.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

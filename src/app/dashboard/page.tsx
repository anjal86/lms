'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Inbox,
  ShieldAlert,
  UserRoundSearch,
} from 'lucide-react';
import { useApp } from '@/lib/store';

function MetricCard({
  title,
  value,
  hint,
  href,
  icon: Icon,
}: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof AlertTriangle;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>
          <p className="mt-1 text-xs text-zinc-500">{hint}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-zinc-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-[11px] font-medium text-zinc-500 group-hover:text-zinc-900">
        Review <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { leads, followUps, currentUser } = useApp();
  const now = Date.now();
  const isManagement = currentUser.role === 'admin' || currentUser.role === 'manager';

  const overdueFollowUps = followUps.filter((item) =>
    (item.status === 'pending' || item.status === 'missed') && new Date(item.scheduled_at).getTime() < now
  );
  const breachedLeads = leads.filter((lead) => lead.is_first_response_breached);
  const unassignedLeads = leads.filter((lead) => !lead.assigned_to && !['won', 'lost', 'junk'].includes(lead.stage));
  const staleLeads = leads.filter((lead) => {
    if (['won', 'lost', 'junk'].includes(lead.stage)) return false;
    const lastTouch = lead.last_contacted_at || lead.created_at;
    return now - new Date(lastTouch).getTime() > 48 * 60 * 60 * 1000;
  });
  const duePayments = leads.reduce((count, lead) => {
    const due = (lead.payment_milestones || []).filter((payment) =>
      payment.status !== 'paid' && new Date(payment.due_date).getTime() <= now
    ).length;
    return count + due;
  }, 0);
  const passportRisks = leads.reduce((count, lead) => {
    const risky = (lead.passengers || []).filter((passenger) =>
      passenger.passport_expiry_date &&
      new Date(passenger.passport_expiry_date).getTime() < now + 180 * 24 * 60 * 60 * 1000
    ).length;
    return count + risky;
  }, 0);

  const interventionQueue = [
    ...breachedLeads.map((lead) => ({
      key: `sla-${lead.id}`,
      title: `${lead.lead_code} missed first-response SLA`,
      detail: `${lead.customer_name} · ${lead.destination}`,
      href: `/leads/${lead.id}`,
      severity: 0,
    })),
    ...unassignedLeads.map((lead) => ({
      key: `unassigned-${lead.id}`,
      title: `${lead.lead_code} is unassigned`,
      detail: `${lead.customer_name} · ${lead.destination}`,
      href: `/leads/${lead.id}`,
      severity: 1,
    })),
    ...staleLeads.map((lead) => ({
      key: `stale-${lead.id}`,
      title: `${lead.lead_code} has had no contact for 48+ hours`,
      detail: `${lead.customer_name} · ${lead.destination}`,
      href: `/leads/${lead.id}`,
      severity: 2,
    })),
  ]
    .sort((a, b) => a.severity - b.severity)
    .slice(0, 10);

  return (
    <main className="min-h-full bg-zinc-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Action Center</p>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">What needs attention now</h1>
          </div>
          <p className="text-xs text-zinc-500">
            {isManagement ? 'Agency-wide operational exceptions' : 'Your assigned work and shared unassigned leads'}
          </p>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="Overdue follow-ups" value={overdueFollowUps.length} hint="Callbacks requiring action" href="/follow-ups" icon={CalendarClock} />
          <MetricCard title="SLA breaches" value={breachedLeads.length} hint="First responses already late" href="/leads" icon={ShieldAlert} />
          <MetricCard title="Unassigned leads" value={unassignedLeads.length} hint="Waiting for an owner" href="/leads" icon={Inbox} />
          <MetricCard title="Stale leads" value={staleLeads.length} hint="No contact for 48+ hours" href="/leads" icon={UserRoundSearch} />
          <MetricCard title="Payments due" value={duePayments} hint="Pending milestones at or past due" href="/leads" icon={CircleDollarSign} />
          <MetricCard title="Passport risks" value={passportRisks} hint="Expiry inside the next 6 months" href="/leads" icon={AlertTriangle} />
        </section>

        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Intervention queue</h2>
              <p className="text-[11px] text-zinc-500">SLA breaches first, then unassigned and stale opportunities.</p>
            </div>
            <Link href="/leads" className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900">
              Open pipeline →
            </Link>
          </div>

          {interventionQueue.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">No urgent intervention items right now.</div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {interventionQueue.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-zinc-900">{item.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{item.detail}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 flex-none text-zinc-400" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

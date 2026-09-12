'use client';

import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  FileCheck2,
  Fingerprint,
  Landmark,
  Megaphone,
  PlaneTakeoff,
  Receipt,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import type { Lead } from '@/lib/types';

type EnrichedLead = Lead & {
  source_channel?: string | null;
  source_connection_id?: string | null;
  source_campaign?: string | null;
  source_ad?: string | null;
  source_form?: string | null;
  source_metadata?: Record<string, unknown>;
};

function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 break-words text-xs font-medium text-zinc-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  );
}

function Block({ title, description, icon: Icon, children }: { title: string; description?: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <section className="surface-flat overflow-hidden">
      <div className="flex items-start gap-3 border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon className="h-4 w-4" /></span>
        <div><h3 className="text-xs font-semibold text-zinc-900">{title}</h3>{description && <p className="mt-0.5 text-[11px] text-zinc-500">{description}</p>}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function jsonPreview(value: Record<string, unknown> | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  return Object.entries(value).slice(0, 12);
}

export default function AdvancedLeadDetails({ lead, formatCurrency }: { lead: Lead; formatCurrency: (amount: number) => string }) {
  const enriched = lead as EnrichedLead;
  const paymentMilestones = lead.payment_milestones || [];
  const payments = lead.payment_records || [];
  const travelers = lead.passengers || [];
  const documents = lead.documents || [];
  const suppliers = lead.supplier_payables || [];
  const itinerary = lead.itinerary_days || [];
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const supplierTotal = suppliers.reduce((sum, supplier) => sum + Number(supplier.amount_payable || 0), 0);
  const supplierPaid = suppliers.reduce((sum, supplier) => sum + Number(supplier.amount_paid || 0), 0);
  const packageValue = Number(lead.package_sale_price || lead.won_deal_value || lead.latest_quote?.total_selling_price || 0);
  const sourceMetadata = jsonPreview(enriched.source_metadata);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <Block title="Lead identity" description="Original record, ownership and CRM identifiers." icon={Fingerprint}>
          <div className="grid grid-cols-2 gap-4">
            <Detail label="Lead code" value={lead.lead_code} mono />
            <Detail label="External ID" value={lead.external_id || '—'} mono />
            <Detail label="Created" value={formatDate(lead.created_at)} />
            <Detail label="Updated" value={formatDate(lead.updated_at)} />
            <Detail label="Assigned" value={formatDate(lead.assigned_at)} />
            <Detail label="Assigned by" value={lead.assigned_by || '—'} mono />
          </div>
        </Block>

        <Block title="Source & attribution" description="Where this inquiry came from and which campaign produced it." icon={Megaphone}>
          <div className="grid grid-cols-2 gap-4">
            <Detail label="Channel" value={enriched.source_channel || lead.source || 'Unknown'} />
            <Detail label="Source" value={lead.source || 'Unknown'} />
            <Detail label="Campaign" value={enriched.source_campaign || '—'} />
            <Detail label="Ad" value={enriched.source_ad || '—'} />
            <Detail label="Form" value={enriched.source_form || '—'} />
            <Detail label="Connection" value={enriched.source_connection_id || '—'} mono />
          </div>
        </Block>

        <Block title="Lead quality" description="Qualification, priority and response health." icon={Sparkles}>
          <div className="grid grid-cols-2 gap-4">
            <Detail label="Score" value={lead.lead_score != null ? `${lead.lead_score}/100` : 'Not scored'} mono />
            <Detail label="Temperature" value={lead.lead_temperature || 'Not set'} />
            <Detail label="Priority" value={lead.priority} />
            <Detail label="Stage" value={lead.stage.replaceAll('_', ' ')} />
            <Detail label="First contact" value={formatDate(lead.first_contacted_at)} />
            <Detail label="Reply due" value={formatDate(lead.first_response_due_at)} />
            <Detail label="Reply time" value={lead.first_response_time_seconds != null ? `${Math.round(lead.first_response_time_seconds / 60)} min` : '—'} mono />
            <Detail label="Reply overdue" value={lead.is_first_response_breached ? 'Yes' : 'No'} />
          </div>
        </Block>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Block title="Traveler request" description="All sales qualification details in one place." icon={PlaneTakeoff}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Detail label="Destination" value={lead.destination} />
            <Detail label="Dates" value={lead.travel_dates || 'Flexible'} />
            <Detail label="Duration" value={`${lead.duration_days} days`} mono />
            <Detail label="Adults" value={lead.pax_adults} mono />
            <Detail label="Children" value={lead.pax_children} mono />
            <Detail label="Infants" value={lead.pax_infants} mono />
            <Detail label="Travel type" value={lead.travel_type.replaceAll('_', ' ')} />
            <Detail label="Budget" value={lead.budget_range || 'Not set'} />
            <Detail label="Hotel" value={lead.hotel_category || 'Not set'} />
            <Detail label="Flight needed" value={lead.flight_required ? 'Yes' : 'No'} />
            <Detail label="Visa needed" value={lead.visa_required ? 'Yes' : 'No'} />
            <Detail label="City / country" value={[lead.customer_city, lead.customer_country].filter(Boolean).join(', ') || '—'} />
          </div>
          {lead.special_notes && <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{lead.special_notes}</div>}
        </Block>

        <Block title="Commercial & commission" description="Sale value, supplier cost, profit and agent payout." icon={BadgeDollarSign}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Detail label="Package sale" value={formatCurrency(packageValue)} mono />
            <Detail label="Vendor cost" value={formatCurrency(Number(lead.vendor_net_cost || 0))} mono />
            <Detail label="Gross profit" value={formatCurrency(Number(lead.gross_profit || 0))} mono />
            <Detail label="Margin" value={lead.profit_margin_pct != null ? `${lead.profit_margin_pct}%` : '—'} mono />
            <Detail label="Commission" value={formatCurrency(Number(lead.agent_commission_earned || 0))} mono />
            <Detail label="Commission status" value={lead.commission_status || 'accrued'} />
            <Detail label="Paid by traveler" value={formatCurrency(totalPaid)} mono />
            <Detail label="Traveler balance" value={formatCurrency(Math.max(0, packageValue - totalPaid))} mono />
            <Detail label="Supplier balance" value={formatCurrency(Math.max(0, supplierTotal - supplierPaid))} mono />
          </div>
        </Block>
      </div>

      <Block title="Payments & milestones" description="Expected installments and money received." icon={Receipt}>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Milestones</div>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
              {paymentMilestones.length === 0 ? <div className="p-4 text-xs text-zinc-500">No payment milestones.</div> : paymentMilestones.map((milestone) => (
                <div key={milestone.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
                  <div><div className="text-xs font-semibold text-zinc-800">{milestone.title}</div><div className="mt-0.5 text-[11px] text-zinc-500">Due {milestone.due_date} · {milestone.percentage}%</div></div>
                  <div className="text-right"><div className="font-mono text-xs font-semibold text-zinc-800">{formatCurrency(milestone.amount)}</div><div className="mt-0.5 text-[10px] capitalize text-zinc-500">{milestone.status}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Received payments</div>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
              {payments.length === 0 ? <div className="p-4 text-xs text-zinc-500">No payments recorded.</div> : payments.map((payment) => (
                <div key={payment.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3">
                  <div><div className="text-xs font-semibold text-zinc-800">{payment.receipt_number || 'Payment'}</div><div className="mt-0.5 text-[11px] capitalize text-zinc-500">{payment.method.replaceAll('_', ' ')} · {formatDate(payment.received_at)}</div></div>
                  <div className="font-mono text-xs font-semibold text-emerald-700">{formatCurrency(payment.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Block>

      <div className="grid gap-3 xl:grid-cols-2">
        <Block title="Traveler records & documents" description="Passport, visa and document readiness." icon={UserRoundCheck}>
          <div className="space-y-3">
            {travelers.length === 0 ? <div className="text-xs text-zinc-500">No traveler records.</div> : travelers.map((traveler) => (
              <div key={traveler.id} className="rounded-lg border border-zinc-100 p-3">
                <div className="flex items-center justify-between gap-3"><div className="text-xs font-semibold text-zinc-900">{traveler.full_name}</div><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] capitalize text-zinc-600">{traveler.type}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-3"><Detail label="Passport" value={traveler.passport_number || 'Not added'} mono /><Detail label="Expiry" value={traveler.passport_expiry_date || '—'} /><Detail label="Visa" value={traveler.visa_status.replaceAll('_', ' ')} /><Detail label="6 month validity" value={traveler.is_passport_valid_6months == null ? 'Not checked' : traveler.is_passport_valid_6months ? 'Valid' : 'Needs attention'} /></div>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700"><FileCheck2 className="h-4 w-4" /> {documents.length} stored document{documents.length === 1 ? '' : 's'}</div>
          </div>
        </Block>

        <Block title="Suppliers" description="Supplier commitments, confirmations and balances." icon={Landmark}>
          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-100">
            {suppliers.length === 0 ? <div className="p-4 text-xs text-zinc-500">No supplier payables.</div> : suppliers.map((supplier) => (
              <div key={supplier.id} className="p-3">
                <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-zinc-900">{supplier.supplier_name}</div><div className="mt-0.5 text-[11px] text-zinc-500">{supplier.service_description}</div></div><span className="text-[10px] capitalize text-zinc-500">{supplier.status.replaceAll('_', ' ')}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-600"><span>Payable {formatCurrency(supplier.amount_payable)}</span><span>Paid {formatCurrency(supplier.amount_paid)}</span>{supplier.due_date && <span>Due {supplier.due_date}</span>}</div>
              </div>
            ))}
          </div>
        </Block>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Block title="Itinerary & lifecycle" description="Booking progress without leaving the workspace." icon={CalendarClock}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Detail label="Trip status" value={(lead.trip_status || 'planning').replaceAll('_', ' ')} /><Detail label="Itinerary days" value={itinerary.length} mono /><Detail label="Last contacted" value={formatDate(lead.last_contacted_at)} /><Detail label="Next follow-up" value={formatDate(lead.next_follow_up_at)} /></div>
          <div className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
            {itinerary.length === 0 ? <div className="p-4 text-xs text-zinc-500">No itinerary days.</div> : itinerary.slice(0, 12).map((day) => <div key={day.id} className="flex gap-3 p-3"><span className="w-12 shrink-0 font-mono text-[10px] font-semibold text-blue-600">DAY {day.day_number}</span><div><div className="text-xs font-semibold text-zinc-800">{day.title}</div><div className="mt-0.5 text-[11px] text-zinc-500">{day.hotel_name || 'Hotel not set'} · {day.meal_plan}</div></div></div>)}
          </div>
        </Block>

        <Block title="Outcome & review" description="Close reason and post-trip feedback." icon={ShieldCheck}>
          <div className="grid grid-cols-2 gap-4"><Detail label="Closed" value={formatDate(lead.closed_at)} /><Detail label="Lost reason" value={lead.lost_reason || '—'} /><Detail label="Lost notes" value={lead.lost_notes || '—'} /><Detail label="Last activity" value={lead.last_activity_type?.replaceAll('_', ' ') || '—'} /></div>
          {lead.post_trip_review ? (
            <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-emerald-50 p-3"><Detail label="Rating" value={`${lead.post_trip_review.rating}/5`} mono /><Detail label="NPS" value={lead.post_trip_review.nps_score} mono /><Detail label="Repeat interest" value={lead.post_trip_review.repeat_interest ? 'Yes' : 'No'} /><Detail label="Reviewed" value={formatDate(lead.post_trip_review.reviewed_at)} /></div>
          ) : <div className="mt-4 flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500"><AlertTriangle className="h-4 w-4" /> No post-trip review yet.</div>}
        </Block>
      </div>

      {sourceMetadata && (
        <Block title="Source metadata" description="Provider payload details kept for attribution and troubleshooting." icon={Megaphone}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sourceMetadata.map(([key, value]) => <Detail key={key} label={key.replaceAll('_', ' ')} value={typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value)} mono />)}
          </div>
        </Block>
      )}
    </div>
  );
}

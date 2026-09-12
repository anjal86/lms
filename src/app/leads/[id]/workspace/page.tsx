'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  MessageSquare,
  Phone,
  Receipt,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { useApp } from '@/lib/store';
import type { LeadStage, TripLifecycleStatus } from '@/lib/types';
import SlaBadge from '@/components/leads/SlaBadge';
import QuickLogModal from '@/components/leads/QuickLogModal';
import WhatsAppModal from '@/components/leads/WhatsAppModal';
import WinDealModal from '@/components/leads/WinDealModal';
import LostDealModal from '@/components/leads/LostDealModal';

const QuoteBuilderModal = dynamic(() => import('@/components/leads/QuoteBuilderModal'), { ssr: false });

type WorkspaceTab = 'overview' | 'communication' | 'quote' | 'travelers' | 'payments' | 'trip';

const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  quote_sent: 'Quote sent',
  in_negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  junk: 'Junk',
};

const TRIP_LABELS: Record<TripLifecycleStatus, string> = {
  planning: 'Planning',
  booked: 'Booked',
  pre_departure: 'Pre-departure',
  on_trip: 'On trip',
  completed: 'Completed',
};

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'communication', label: 'Communication' },
  { id: 'quote', label: 'Quote & itinerary' },
  { id: 'travelers', label: 'Travelers' },
  { id: 'payments', label: 'Payments' },
  { id: 'trip', label: 'Trip' },
];

function SummaryField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 text-sm font-medium text-zinc-800 ${mono ? 'font-mono tracking-tight' : ''}`}>{value}</div>
    </div>
  );
}

export default function LeadWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const {
    allLeads,
    allProfiles,
    activities,
    currentUser,
    assignLead,
    updateLeadStage,
    updateTripStatus,
    logActivity,
    formatCurrency,
    formatAppDate,
  } = useApp();

  const lead = allLeads.find((item) => item.id === leadId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [note, setNote] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  useEffect(() => {
    document.title = lead ? `${lead.customer_name} — Lead Workspace` : 'Lead Workspace — Wanderlust CRM';
  }, [lead]);

  const leadActivities = useMemo(
    () => activities.filter((activity) => activity.lead_id === leadId),
    [activities, leadId]
  );

  if (!lead) {
    return (
      <div className="empty-state surface-flat">
        <UserRound className="h-5 w-5 text-zinc-300" />
        <h1 className="empty-state-title mt-3">Lead not available</h1>
        <p className="empty-state-description">It may have been removed, or your account may not have access to it.</p>
        <button type="button" onClick={() => router.push(currentUser.role === 'agent' ? '/my-work' : '/leads')} className="button-primary mt-4">
          Back to leads
        </button>
      </div>
    );
  }

  const owner = allProfiles.find((profile) => profile.id === lead.assigned_to);
  const activeAgents = allProfiles.filter((profile) => profile.role === 'agent' && profile.is_active);
  const totalPaid = (lead.payment_records || []).reduce((sum, record) => sum + record.amount, 0);
  const packageValue = lead.package_sale_price || lead.won_deal_value || lead.latest_quote?.total_selling_price || 0;
  const balance = Math.max(0, packageValue - totalPaid);
  const travelers = lead.passengers || [];
  const documents = lead.documents || [];
  const itinerary = lead.itinerary_days || [];
  const suppliers = lead.supplier_payables || [];
  const tripStatus = (lead.trip_status || 'planning') as TripLifecycleStatus;
  const checklist = lead.checklist;
  const checklistValues = checklist ? Object.values(checklist) : [];
  const checklistDone = checklistValues.filter(Boolean).length;
  const checklistTotal = checklistValues.length;

  const handleStage = (stage: LeadStage) => {
    if (stage === 'won') {
      setWinOpen(true);
      return;
    }
    if (stage === 'lost') {
      setLostOpen(true);
      return;
    }
    updateLeadStage(lead.id, stage);
  };

  const saveNote = (event: FormEvent) => {
    event.preventDefault();
    const clean = note.trim();
    if (!clean) return;
    logActivity({ leadId: lead.id, type: 'note', title: 'Note added', notes: clean });
    setNote('');
  };

  const backHref = currentUser.role === 'agent' ? '/my-work' : '/leads';

  return (
    <div className="app-page">
      <header className="surface-flat">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link href={backHref} className="button-secondary button-sm px-2" aria-label="Back to leads">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-zinc-400">{lead.lead_code}</span>
                <span className="status-line">
                  <span className={`status-dot ${lead.priority === 'urgent' ? 'status-dot-danger' : lead.priority === 'high' ? 'status-dot-warning' : ''}`} />
                  <span className="capitalize">{lead.priority} priority</span>
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-950">{lead.customer_name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span className="font-mono">{lead.customer_phone}</span>
                {lead.customer_email && <span>{lead.customer_email}</span>}
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {lead.destination}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setWaOpen(true)} className="button-secondary">
              <MessageSquare className="h-4 w-4" /> WhatsApp
            </button>
            <button type="button" onClick={() => setQuoteOpen(true)} className="button-secondary">
              <FileText className="h-4 w-4" /> {lead.latest_quote ? 'Edit quote' : 'Create quote'}
            </button>
            <button type="button" onClick={() => setLogOpen(true)} className="button-primary">
              <Phone className="h-4 w-4" /> Log contact
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <SlaBadge lead={lead} detailed />
            {lead.next_follow_up_at && (
              <span className="font-mono text-[11px] text-zinc-500">Next: {formatAppDate(lead.next_follow_up_at)}</span>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
              Stage
              <select value={lead.stage} onChange={(event) => handleStage(event.target.value as LeadStage)} className="select-field min-w-36">
                {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
                Owner
                <select
                  value={lead.assigned_to || ''}
                  onChange={(event) => event.target.value && assignLead(lead.id, event.target.value)}
                  className="select-field min-w-44"
                >
                  <option value="" disabled>Unassigned</option>
                  {activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <main className="min-w-0 surface-flat">
          <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2" aria-label="Lead workspace sections">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-9 whitespace-nowrap border-b-2 px-3 text-xs font-semibold ${
                  activeTab === tab.id ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="p-4 sm:p-5">
            {activeTab === 'overview' && (
              <div className="space-y-5">
                <section>
                  <div className="section-heading">Trip request</div>
                  <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <SummaryField label="Destination" value={lead.destination} />
                    <SummaryField label="Travel dates" value={lead.travel_dates || 'Flexible'} />
                    <SummaryField label="Travelers" value={`${lead.pax_adults} adult${lead.pax_adults === 1 ? '' : 's'}${lead.pax_children ? ` + ${lead.pax_children} child` : ''}`} />
                    <SummaryField label="Duration" value={`${lead.duration_days} days`} mono />
                    <SummaryField label="Travel style" value={lead.travel_type.replaceAll('_', ' ')} />
                    <SummaryField label="Budget" value={lead.budget_range || 'Not set'} mono />
                    <SummaryField label="Hotel" value={lead.hotel_category || 'Not set'} />
                    <SummaryField label="Source" value={lead.source || 'Unknown'} />
                  </div>
                </section>

                {lead.special_notes && (
                  <section className="border-t border-line pt-5">
                    <div className="section-heading">Traveler notes</div>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">{lead.special_notes}</p>
                  </section>
                )}

                <section className="border-t border-line pt-5">
                  <div className="section-heading">Current position</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="surface-flat p-3">
                      <div className="metric-label">Quote</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{lead.latest_quote ? lead.latest_quote.quote_number : 'Not created'}</div>
                      <div className="mt-1 text-xs text-zinc-500">{lead.latest_quote?.package_title || 'Create a proposal when the trip is qualified.'}</div>
                    </div>
                    <div className="surface-flat p-3">
                      <div className="metric-label">Payments</div>
                      <div className="mt-1 font-mono text-sm font-semibold text-zinc-900">{formatCurrency(totalPaid)}</div>
                      <div className="mt-1 text-xs text-zinc-500">{balance > 0 ? `${formatCurrency(balance)} remaining` : packageValue > 0 ? 'Paid in full' : 'No package value yet'}</div>
                    </div>
                    <div className="surface-flat p-3">
                      <div className="metric-label">Trip</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{TRIP_LABELS[tripStatus]}</div>
                      <div className="mt-1 text-xs text-zinc-500">{travelers.length} traveler record{travelers.length === 1 ? '' : 's'} · {documents.length} document{documents.length === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'communication' && (
              <div className="space-y-4">
                <form onSubmit={saveNote} className="surface-flat p-3">
                  <label htmlFor="manager-note" className="text-xs font-semibold text-zinc-700">Add a note</label>
                  <textarea
                    id="manager-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="textarea-field mt-2 min-h-20"
                    placeholder="Add context the next person should know…"
                  />
                  <div className="mt-2 flex justify-end"><button type="submit" className="button-primary button-sm" disabled={!note.trim()}>Save note</button></div>
                </form>

                <section>
                  <div className="section-heading">Recent activity</div>
                  <div className="mt-3 divide-y divide-line border-y border-line">
                    {leadActivities.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">No activity has been logged yet.</div>
                    ) : leadActivities.slice(0, 25).map((activity) => {
                      const agent = allProfiles.find((profile) => profile.id === activity.agent_id);
                      return (
                        <div key={activity.id} className="flex gap-3 py-3">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-zinc-800">{activity.title}</div>
                              <time className="font-mono text-[10px] text-zinc-400">{formatAppDate(activity.created_at)}</time>
                            </div>
                            {activity.notes && <p className="mt-1 text-xs leading-5 text-zinc-600">{activity.notes}</p>}
                            <div className="mt-1 text-[10px] text-zinc-400">{agent?.full_name || 'System'} · {activity.activity_type.replaceAll('_', ' ')}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'quote' && (
              <div className="space-y-5">
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="section-heading">Current quote</div>
                      <div className="section-description">Keep the proposal and itinerary easy to review before opening advanced editing.</div>
                    </div>
                    <button type="button" onClick={() => setQuoteOpen(true)} className="button-primary button-sm">{lead.latest_quote ? 'Edit quote' : 'Create quote'}</button>
                  </div>
                  {lead.latest_quote ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <SummaryField label="Quote" value={lead.latest_quote.quote_number} mono />
                      <SummaryField label="Selling price" value={formatCurrency(lead.latest_quote.total_selling_price)} mono />
                      <SummaryField label="Gross profit" value={formatCurrency(lead.latest_quote.gross_profit)} mono />
                      <SummaryField label="Margin" value={`${lead.latest_quote.profit_margin_pct}%`} mono />
                    </div>
                  ) : <div className="mt-3 text-sm text-zinc-500">No quote has been created yet.</div>}
                </section>

                <section className="border-t border-line pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="section-heading">Itinerary</div>
                      <div className="section-description">{itinerary.length} day{itinerary.length === 1 ? '' : 's'} currently planned.</div>
                    </div>
                    <Link href={`/leads/${lead.id}`} className="button-secondary button-sm">Edit itinerary <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                  <div className="mt-3 divide-y divide-line border-y border-line">
                    {itinerary.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">No itinerary days have been added.</div>
                    ) : itinerary.slice(0, 8).map((day) => (
                      <div key={day.id} className="flex gap-3 py-3">
                        <div className="w-12 shrink-0 font-mono text-[11px] font-semibold text-zinc-400">DAY {day.day_number}</div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-800">{day.title}</div>
                          <div className="mt-1 text-xs text-zinc-500">{day.hotel_name || 'Hotel not set'} · {day.meal_plan}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'travelers' && (
              <div className="space-y-5">
                <section>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="section-heading">Travelers</div>
                      <div className="section-description">Identity and travel-document readiness at a glance.</div>
                    </div>
                    <Link href={`/leads/${lead.id}`} className="button-secondary button-sm">Manage travelers <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                  <div className="mt-3 divide-y divide-line border-y border-line">
                    {travelers.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">No traveler profiles have been added.</div>
                    ) : travelers.map((traveler) => (
                      <div key={traveler.id} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center">
                        <div>
                          <div className="text-xs font-semibold text-zinc-800">{traveler.full_name}</div>
                          <div className="mt-0.5 text-[11px] capitalize text-zinc-500">{traveler.type}</div>
                        </div>
                        <div className="font-mono text-[11px] text-zinc-600">{traveler.passport_number || 'No passport'}</div>
                        <div className="text-[11px] capitalize text-zinc-600">{(traveler.visa_status || 'not set').replaceAll('_', ' ')}</div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="border-t border-line pt-5">
                  <div className="section-heading">Documents</div>
                  <div className="section-description">{documents.length} file{documents.length === 1 ? '' : 's'} stored for this lead.</div>
                </section>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="metric"><div className="metric-label">Package value</div><div className="metric-value">{formatCurrency(packageValue)}</div></div>
                  <div className="metric"><div className="metric-label">Paid</div><div className="metric-value">{formatCurrency(totalPaid)}</div></div>
                  <div className="metric"><div className="metric-label">Remaining</div><div className="metric-value">{formatCurrency(balance)}</div></div>
                </div>
                <section>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="section-heading">Payment history</div>
                      <div className="section-description">Review received payments here; use advanced operations to record or edit financial details.</div>
                    </div>
                    <Link href={`/leads/${lead.id}`} className="button-secondary button-sm">Manage payments <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                  <div className="mt-3 divide-y divide-line border-y border-line">
                    {(lead.payment_records || []).length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500">No payments have been recorded.</div>
                    ) : (lead.payment_records || []).map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-4 py-3">
                        <div>
                          <div className="font-mono text-xs font-semibold text-zinc-800">{formatCurrency(payment.amount)}</div>
                          <div className="mt-0.5 text-[11px] capitalize text-zinc-500">{payment.method.replaceAll('_', ' ')}{payment.reference_no ? ` · ${payment.reference_no}` : ''}</div>
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400">{formatAppDate(payment.received_at || payment.created_at)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'trip' && (
              <div className="space-y-5">
                <section>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="section-heading">Trip status</div>
                      <div className="section-description">Use plain lifecycle states so the whole team knows where the booking stands.</div>
                    </div>
                    <label className="text-xs font-semibold text-zinc-600">
                      <span className="sr-only">Trip status</span>
                      <select value={tripStatus} onChange={(event) => updateTripStatus(lead.id, event.target.value as TripLifecycleStatus)} className="select-field min-w-44">
                        {Object.entries(TRIP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="border-t border-line pt-5">
                  <div className="section-heading">Readiness</div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full bg-zinc-900" style={{ width: `${checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0}%` }} />
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-zinc-600">{checklistDone}/{checklistTotal || 0}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{checklistTotal ? 'Pre-departure checklist completion.' : 'No pre-departure checklist has been started.'}</p>
                </section>

                <section className="border-t border-line pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="section-heading">Suppliers</div>
                      <div className="section-description">{suppliers.length} supplier payable{suppliers.length === 1 ? '' : 's'} attached to this booking.</div>
                    </div>
                    <Link href={`/leads/${lead.id}`} className="button-secondary button-sm">Advanced trip operations <ChevronRight className="h-3.5 w-3.5" /></Link>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>

        <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
          <section className="surface-flat p-4">
            <div className="section-heading">Next step</div>
            <div className="mt-3"><SlaBadge lead={lead} detailed /></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLogOpen(true)} className="button-primary button-sm"><Phone className="h-3.5 w-3.5" /> Contact</button>
              <button type="button" onClick={() => setWaOpen(true)} className="button-secondary button-sm"><MessageSquare className="h-3.5 w-3.5" /> Message</button>
            </div>
          </section>

          <section className="surface-flat p-4">
            <div className="section-heading">At a glance</div>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600"><UserRound className="h-3.5 w-3.5 text-zinc-400" /><span>{owner?.full_name || 'Unassigned'}</span></div>
              <div className="flex items-center gap-2 text-xs text-zinc-600"><Users className="h-3.5 w-3.5 text-zinc-400" /><span>{lead.pax_adults + lead.pax_children + lead.pax_infants} travelers</span></div>
              <div className="flex items-center gap-2 text-xs text-zinc-600"><CalendarDays className="h-3.5 w-3.5 text-zinc-400" /><span>{lead.travel_dates || 'Flexible dates'}</span></div>
              <div className="flex items-center gap-2 text-xs text-zinc-600"><Receipt className="h-3.5 w-3.5 text-zinc-400" /><span className="font-mono">{formatCurrency(packageValue)}</span></div>
              <div className="flex items-center gap-2 text-xs text-zinc-600"><ShieldCheck className="h-3.5 w-3.5 text-zinc-400" /><span>{documents.length} documents</span></div>
            </div>
          </section>

          <Link href={`/leads/${lead.id}`} className="surface-flat flex items-center justify-between gap-3 p-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
            <span>Advanced trip & finance details</span>
            <ChevronRight className="h-4 w-4 text-zinc-400" />
          </Link>
        </aside>
      </div>

      {logOpen && <QuickLogModal lead={lead} isOpen onClose={() => setLogOpen(false)} />}
      {waOpen && <WhatsAppModal lead={lead} isOpen onClose={() => setWaOpen(false)} />}
      {quoteOpen && <QuoteBuilderModal lead={lead} isOpen onClose={() => setQuoteOpen(false)} />}
      {winOpen && <WinDealModal lead={lead} isOpen onClose={() => setWinOpen(false)} />}
      {lostOpen && <LostDealModal lead={lead} isOpen onClose={() => setLostOpen(false)} />}
    </div>
  );
}

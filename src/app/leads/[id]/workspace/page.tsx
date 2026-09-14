'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  History,
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
import AdvancedLeadDetails from '@/components/leads/AdvancedLeadDetails';
import UnifiedCommunicationTimeline from '@/components/leads/UnifiedCommunicationTimeline';
import { buildQualificationSummary, getCanonicalNextAction } from '@/lib/opportunity-workspace';

const QuoteBuilderModal = dynamic(() => import('@/components/leads/QuoteBuilderModal'), { ssr: false });

type WorkspaceTab = 'overview' | 'communication' | 'quote' | 'travelers' | 'payments' | 'trip' | 'details';
type OmnichannelLead = {
  source_channel?: string | null;
  source_campaign?: string | null;
};

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
  { id: 'overview', label: 'Opportunity' },
  { id: 'communication', label: 'Conversations' },
  { id: 'quote', label: 'Quotes & itinerary' },
  { id: 'travelers', label: 'People & documents' },
  { id: 'payments', label: 'Payments' },
  { id: 'trip', label: 'Operations' },
  { id: 'details', label: 'All details' },
];

const CHANNEL_DOTS: Record<string, string> = {
  facebook: 'bg-blue-600',
  instagram: 'bg-pink-600',
  whatsapp: 'bg-emerald-600',
  tiktok: 'bg-zinc-950',
  email: 'bg-amber-600',
  website: 'bg-cyan-600',
  api: 'bg-violet-600',
};

function SummaryField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>
      <div className={`mt-1 break-words text-sm font-medium text-zinc-800 ${mono ? 'font-mono tracking-tight' : ''}`}>{value}</div>
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
    followUps,
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
    document.title = lead ? `${lead.customer_name} — Opportunity` : 'Opportunity — Wanderlust CRM';
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
        <button type="button" onClick={() => router.push(currentUser.role === 'agent' ? '/my-work' : '/leads')} className="button-primary mt-4">Back to leads</button>
      </div>
    );
  }

  const omniLead = lead as typeof lead & OmnichannelLead;
  const owner = allProfiles.find((profile) => profile.id === lead.assigned_to);
  const activeAgents = allProfiles.filter((profile) => profile.role === 'agent' && profile.is_active);
  const totalPaid = (lead.payment_records || []).reduce((sum, record) => sum + record.amount, 0);
  const packageValue = lead.package_sale_price || lead.won_deal_value || lead.latest_quote?.total_selling_price || 0;
  const balance = Math.max(0, packageValue - totalPaid);
  const travelers = lead.passengers || [];
  const documents = lead.documents || [];
  const itinerary = lead.itinerary_days || [];
  const suppliers = lead.supplier_payables || [];
  const milestones = lead.payment_milestones || [];
  const tripStatus = (lead.trip_status || 'planning') as TripLifecycleStatus;
  const checklist = lead.checklist;
  const checklistValues = checklist ? Object.values(checklist) : [];
  const checklistDone = checklistValues.filter(Boolean).length;
  const checklistTotal = checklistValues.length;
  const sourceChannel = omniLead.source_channel || lead.source || 'Unknown';
  const qualification = buildQualificationSummary(lead);
  const nextAction = getCanonicalNextAction(lead, followUps);
  const recentActivities = leadActivities.slice(0, 4);

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
  const channelDot = CHANNEL_DOTS[sourceChannel.toLowerCase()] || 'bg-zinc-400';

  return (
    <div className="app-page">
      <header className="surface-flat overflow-hidden">
        <div className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Link href={backHref} className="button-secondary button-sm px-2" aria-label="Back to leads"><ArrowLeft className="h-4 w-4" /></Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-zinc-400">{lead.lead_code}</span>
                  <span className="status-line"><span className={`status-dot ${channelDot}`} /><span className="capitalize">{sourceChannel}</span></span>
                  {omniLead.source_campaign && <span className="max-w-[22rem] truncate text-[10px] text-zinc-500" title={omniLead.source_campaign}>{omniLead.source_campaign}</span>}
                  <span className="status-line"><span className={`status-dot ${lead.priority === 'urgent' ? 'status-dot-danger' : lead.priority === 'high' ? 'status-dot-warning' : ''}`} /><span className="capitalize">{lead.priority} priority</span></span>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                  <h1 className="min-w-0 truncate text-xl font-semibold text-zinc-950">{lead.customer_name}</h1>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span className="font-mono">{lead.customer_phone}</span>
                  {lead.customer_email && <span>{lead.customer_email}</span>}
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {lead.destination}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setWaOpen(true)} className="button-secondary"><MessageSquare className="h-4 w-4" /> WhatsApp</button>
              <button type="button" onClick={() => setQuoteOpen(true)} className="button-secondary"><FileText className="h-4 w-4" /> {lead.latest_quote ? 'Edit quote' : 'Create quote'}</button>
              <button type="button" onClick={() => setLogOpen(true)} className="button-primary"><Phone className="h-4 w-4" /> Log contact</button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <SlaBadge lead={lead} detailed />
            {lead.next_follow_up_at && <span className="font-mono text-[11px] text-zinc-500">Next: {formatAppDate(lead.next_follow_up_at)}</span>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">Stage
              <select value={lead.stage} onChange={(event) => handleStage(event.target.value as LeadStage)} className="select-field min-w-36">
                {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">Owner
                <select value={lead.assigned_to || ''} onChange={(event) => event.target.value && assignLead(lead.id, event.target.value)} className="select-field min-w-44">
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
          <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2" aria-label="Opportunity workspace sections">
            {TABS.map((tab) => (
              <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)} className={`min-h-[44px] whitespace-nowrap border-b-2 px-3 text-xs font-semibold focus-visible:ring-1 focus-visible:ring-zinc-950 ${activeTab === tab.id ? 'border-zinc-950 text-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-900'}`}>{tab.label}</button>
            ))}
          </nav>

          <div className="p-4 sm:p-5">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <section aria-labelledby="next-action-heading" className="rounded-lg border border-zinc-300 bg-zinc-950 p-4 text-white">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div id="next-action-heading" className="flex items-center gap-2 text-[10px] font-semibold uppercase text-zinc-400"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Next action</div>
                      <div className="mt-1 text-base font-semibold">{nextAction.title}</div>
                      <div className="mt-1 font-mono text-[11px] text-zinc-400">{nextAction.scheduledAt ? formatAppDate(nextAction.scheduledAt) : 'No due date set'}{nextAction.channel ? ` · ${nextAction.channel.replaceAll('_', ' ')}` : ''}</div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setWaOpen(true)} className="button-secondary min-h-[44px] border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"><MessageSquare className="h-4 w-4" aria-hidden="true" /> Message</button>
                      <button type="button" onClick={() => setLogOpen(true)} className="min-h-[44px] rounded-md bg-white px-3 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-white"><Phone className="mr-2 inline h-4 w-4" aria-hidden="true" /> Log contact</button>
                    </div>
                  </div>
                </section>

                <div className="grid gap-6 lg:grid-cols-2">
                  <section aria-labelledby="customer-heading">
                    <div id="customer-heading" className="section-heading">Customer</div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <SummaryField label="Name" value={lead.customer_name} />
                      <SummaryField label="Phone" value={lead.customer_phone} mono />
                      <SummaryField label="Email" value={lead.customer_email || 'Not set'} />
                      <SummaryField label="Location" value={[lead.customer_city, lead.customer_country].filter(Boolean).join(', ') || 'Not set'} />
                    </div>
                  </section>
                  <section aria-labelledby="opportunity-heading" className="border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <div id="opportunity-heading" className="section-heading">Opportunity details</div>
                    <div className="mt-3 grid grid-cols-2 gap-4">
                      <SummaryField label="Business pack" value={qualification.packLabel} />
                      <SummaryField label="Destination" value={lead.destination || 'Not set'} />
                      <SummaryField label="Travel dates" value={lead.travel_dates || 'Flexible'} />
                      <SummaryField label="Budget" value={lead.budget_range || 'Not set'} mono />
                    </div>
                  </section>
                </div>

                <section aria-labelledby="qualification-heading" className="border-t border-line pt-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div><div id="qualification-heading" className="section-heading">Qualification</div><div className="section-description">{qualification.packLabel} progression requirements</div></div>
                    <div className="font-mono text-sm font-semibold text-zinc-900">{qualification.percent}% <span className="text-[11px] font-normal text-zinc-500">complete</span></div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-label={`${qualification.percent}% qualification complete`} role="progressbar" aria-valuenow={qualification.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-zinc-950" style={{ width: `${qualification.percent}%` }} /></div>
                  <div className="mt-4 grid gap-x-6 border-y border-line sm:grid-cols-2">
                    {qualification.items.map((item) => <div key={item.key} className="flex min-h-[44px] items-center gap-2 border-b border-zinc-100 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"><span className="shrink-0">{item.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 text-zinc-400" aria-hidden="true" />}</span><span className="min-w-0 flex-1 text-xs font-medium text-zinc-700">{item.label}</span><span className={`max-w-[48%] truncate text-right text-[11px] ${item.complete ? 'text-zinc-500' : 'font-semibold text-amber-700'}`} title={item.value}>{item.value}</span></div>)}
                  </div>
                  {qualification.missing.length > 0 && <p className="mt-3 text-xs text-zinc-600"><span className="font-semibold text-zinc-900">Missing:</span> {qualification.missing.join(', ')}</p>}
                </section>

                <section aria-labelledby="commercial-heading" className="border-t border-line pt-5">
                  <div id="commercial-heading" className="section-heading">Commercial & delivery</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button type="button" onClick={() => setActiveTab('quote')} className="surface-flat min-h-[96px] p-3 text-left hover:border-zinc-400 hover:bg-zinc-50"><div className="metric-label">Quote / proposal</div><div className="mt-1 text-sm font-semibold text-zinc-900">{lead.latest_quote ? lead.latest_quote.quote_number : 'Not created'}</div><div className="mt-1 text-xs text-zinc-500">{lead.latest_quote ? lead.latest_quote.status : 'Create after qualification'}</div></button>
                    <button type="button" onClick={() => setActiveTab('travelers')} className="surface-flat min-h-[96px] p-3 text-left hover:border-zinc-400 hover:bg-zinc-50"><div className="metric-label">Documents</div><div className="mt-1 text-sm font-semibold text-zinc-900">{documents.length} received</div><div className="mt-1 text-xs text-zinc-500">{travelers.length} customer profile{travelers.length === 1 ? '' : 's'}</div></button>
                    <button type="button" onClick={() => setActiveTab(lead.stage === 'won' ? 'trip' : 'payments')} className="surface-flat min-h-[96px] p-3 text-left hover:border-zinc-400 hover:bg-zinc-50"><div className="metric-label">{lead.stage === 'won' ? 'Post-sale operations' : 'Deal value'}</div><div className="mt-1 font-mono text-sm font-semibold text-zinc-900">{lead.stage === 'won' ? TRIP_LABELS[tripStatus] : formatCurrency(packageValue)}</div><div className="mt-1 text-xs text-zinc-500">{lead.stage === 'won' ? `${checklistDone}/${checklistTotal || 0} readiness checks` : `${formatCurrency(balance)} balance`}</div></button>
                  </div>
                </section>

                <section aria-labelledby="activity-heading" className="border-t border-line pt-5">
                  <div className="flex items-center justify-between gap-3"><div><div id="activity-heading" className="section-heading">Conversations & notes</div><div className="section-description">Recent opportunity activity</div></div><button type="button" onClick={() => setActiveTab('communication')} className="button-secondary button-sm min-h-[44px]">View timeline</button></div>
                  <form onSubmit={saveNote} className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <label htmlFor="opportunity-note" className="text-xs font-semibold text-zinc-700">Add internal note</label>
                    <textarea id="opportunity-note" value={note} onChange={(event) => setNote(event.target.value)} className="textarea-field mt-2 min-h-20 bg-white" placeholder="Add context the next person should know…" />
                    <div className="mt-2 flex justify-end"><button type="submit" className="button-primary button-sm min-h-[44px]" disabled={!note.trim()}>Save note</button></div>
                  </form>
                  <div className="mt-3 divide-y divide-line border-y border-line">
                    {recentActivities.length === 0 ? <div className="py-6 text-center text-xs text-zinc-500">No activity recorded yet.</div> : recentActivities.map((activity) => <div key={activity.id} className="flex gap-3 py-3"><History className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-zinc-800">{activity.title}</div>{activity.notes && <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{activity.notes}</div>}</div><time className="shrink-0 font-mono text-[10px] text-zinc-400">{formatAppDate(activity.created_at)}</time></div>)}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'communication' && (
              <div className="space-y-5">
                <form onSubmit={saveNote} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <label htmlFor="manager-note" className="text-xs font-semibold text-zinc-700">Internal note</label>
                  <textarea id="manager-note" value={note} onChange={(event) => setNote(event.target.value)} className="textarea-field mt-2 min-h-20" placeholder="Add context the next person should know…" />
                  <div className="mt-2 flex justify-end"><button type="submit" className="button-primary button-sm" disabled={!note.trim()}>Save note</button></div>
                </form>
                <UnifiedCommunicationTimeline leadId={lead.id} activities={leadActivities} profiles={allProfiles} formatDate={formatAppDate} />
              </div>
            )}

            {activeTab === 'quote' && (
              <div className="space-y-5">
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="section-heading">Current quote</div><div className="section-description">Proposal pricing stays beside the itinerary instead of opening another lead page.</div></div><button type="button" onClick={() => setQuoteOpen(true)} className="button-primary button-sm">{lead.latest_quote ? 'Edit quote' : 'Create quote'}</button></div>
                  {lead.latest_quote ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><SummaryField label="Quote" value={lead.latest_quote.quote_number} mono /><SummaryField label="Selling price" value={formatCurrency(lead.latest_quote.total_selling_price)} mono /><SummaryField label="Gross profit" value={formatCurrency(lead.latest_quote.gross_profit)} mono /><SummaryField label="Margin" value={`${lead.latest_quote.profit_margin_pct}%`} mono /></div> : <div className="mt-3 text-sm text-zinc-500">No quote has been created yet.</div>}
                </section>
                <section className="border-t border-line pt-5">
                  <div className="section-heading">Itinerary</div><div className="section-description">{itinerary.length} day{itinerary.length === 1 ? '' : 's'} currently planned.</div>
                  <div className="mt-3 divide-y divide-line border-y border-line">
                    {itinerary.length === 0 ? <div className="py-8 text-center text-xs text-zinc-500">No itinerary days have been added.</div> : itinerary.map((day) => <div key={day.id} className="grid gap-2 py-3 sm:grid-cols-[4rem_minmax(0,1fr)_12rem]"><div className="font-mono text-[11px] font-semibold text-zinc-700">DAY {day.day_number}</div><div><div className="text-xs font-semibold text-zinc-800">{day.title}</div>{day.description && <div className="mt-1 text-xs leading-5 text-zinc-500">{day.description}</div>}</div><div className="text-[11px] text-zinc-500">{day.hotel_name || 'Hotel not set'} · {day.meal_plan}</div></div>)}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'travelers' && (
              <div className="space-y-5">
                <section><div className="section-heading">Travelers</div><div className="section-description">Identity, passport and visa readiness in the same opportunity workspace.</div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {travelers.length === 0 ? <div className="col-span-full py-8 text-center text-xs text-zinc-500">No traveler profiles have been added.</div> : travelers.map((traveler) => (
                      <article key={traveler.id} className="surface-flat p-3"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-900">{traveler.full_name}</div><div className="mt-0.5 text-[11px] capitalize text-zinc-500">{traveler.type}</div></div><span className="status-line"><span className={`status-dot ${traveler.is_passport_valid_6months === false ? 'status-dot-danger' : 'status-dot-success'}`} /><span>{traveler.is_passport_valid_6months === false ? 'Passport attention' : 'Passport check'}</span></span></div><div className="mt-3 grid grid-cols-2 gap-3"><SummaryField label="Passport" value={traveler.passport_number || 'Not added'} mono /><SummaryField label="Country" value={traveler.passport_country || '—'} /><SummaryField label="Expiry" value={traveler.passport_expiry_date || '—'} /><SummaryField label="Visa" value={(traveler.visa_status || 'not set').replaceAll('_', ' ')} /></div></article>
                    ))}
                  </div>
                </section>
                <section className="border-t border-line pt-5"><div className="section-heading">Documents</div><div className="section-description">{documents.length} file{documents.length === 1 ? '' : 's'} stored for this lead.</div><div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">{documents.length === 0 ? <div className="p-4 text-xs text-zinc-500">No documents uploaded.</div> : documents.map((document) => <div key={document.id} className="flex items-center justify-between gap-4 p-3"><div><div className="text-xs font-semibold text-zinc-800">{document.title}</div><div className="mt-0.5 text-[11px] capitalize text-zinc-500">{document.category.replaceAll('_', ' ')} · {document.file_name}</div></div><div className="font-mono text-[10px] text-zinc-400">{formatAppDate(document.uploaded_at)}</div></div>)}</div></section>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="metric"><div className="metric-label">Package value</div><div className="metric-value">{formatCurrency(packageValue)}</div></div><div className="metric"><div className="metric-label">Paid</div><div className="metric-value">{formatCurrency(totalPaid)}</div></div><div className="metric"><div className="metric-label">Remaining</div><div className="metric-value">{formatCurrency(balance)}</div></div></div>
                <section><div className="section-heading">Payment milestones</div><div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">{milestones.length === 0 ? <div className="p-4 text-xs text-zinc-500">No payment milestones have been created.</div> : milestones.map((milestone) => <div key={milestone.id} className="flex items-center justify-between gap-4 p-3"><div><div className="text-xs font-semibold text-zinc-800">{milestone.title}</div><div className="mt-0.5 text-[11px] text-zinc-500">Due {milestone.due_date} · {milestone.percentage}%</div></div><div className="text-right"><div className="font-mono text-xs font-semibold text-zinc-800">{formatCurrency(milestone.amount)}</div><div className="text-[10px] capitalize text-zinc-500">{milestone.status}</div></div></div>)}</div></section>
                <section className="border-t border-line pt-5"><div className="section-heading">Payment history</div><div className="section-description">All recorded traveler payments.</div><div className="mt-3 divide-y divide-line border-y border-line">{(lead.payment_records || []).length === 0 ? <div className="py-8 text-center text-xs text-zinc-500">No payments have been recorded.</div> : (lead.payment_records || []).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-4 py-3"><div><div className="font-mono text-xs font-semibold text-emerald-700">{formatCurrency(payment.amount)}</div><div className="mt-0.5 text-[11px] capitalize text-zinc-500">{payment.receipt_number} · {payment.method.replaceAll('_', ' ')}{payment.reference_no ? ` · ${payment.reference_no}` : ''}</div></div><div className="font-mono text-[10px] text-zinc-400">{formatAppDate(payment.received_at || payment.created_at)}</div></div>)}</div></section>
              </div>
            )}

            {activeTab === 'trip' && (
              <div className="space-y-5">
                <section><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="section-heading">Trip status</div><div className="section-description">One lifecycle state for the whole team.</div></div><label className="text-xs font-semibold text-zinc-600"><span className="sr-only">Trip status</span><select value={tripStatus} onChange={(event) => updateTripStatus(lead.id, event.target.value as TripLifecycleStatus)} className="select-field min-w-44">{Object.entries(TRIP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></section>
                <section className="border-t border-line pt-5"><div className="section-heading">Pre-departure readiness</div><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-zinc-950" style={{ width: `${checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0}%` }} /></div><span className="font-mono text-[11px] font-semibold text-zinc-600">{checklistDone}/{checklistTotal || 0}</span></div><p className="mt-2 text-xs text-zinc-500">{checklistTotal ? 'Pre-departure checklist completion.' : 'No pre-departure checklist has been started.'}</p></section>
                <section className="border-t border-line pt-5"><div className="section-heading">Suppliers</div><div className="section-description">{suppliers.length} supplier payable{suppliers.length === 1 ? '' : 's'} attached to this booking.</div><div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">{suppliers.length === 0 ? <div className="p-4 text-xs text-zinc-500">No supplier payables have been added.</div> : suppliers.map((supplier) => <div key={supplier.id} className="p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-zinc-900">{supplier.supplier_name}</div><div className="mt-0.5 text-[11px] text-zinc-500">{supplier.service_description}</div></div><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] capitalize text-zinc-600">{supplier.status.replaceAll('_', ' ')}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-600"><span>Payable {formatCurrency(supplier.amount_payable)}</span><span>Paid {formatCurrency(supplier.amount_paid)}</span>{supplier.due_date && <span>Due {supplier.due_date}</span>}{supplier.confirmation_voucher_no && <span>Voucher {supplier.confirmation_voucher_no}</span>}</div></div>)}</div></section>
              </div>
            )}

            {activeTab === 'details' && <AdvancedLeadDetails lead={lead} formatCurrency={formatCurrency} />}
          </div>
        </main>

        <aside className="space-y-3 xl:sticky xl:top-0 xl:self-start">
          <section className="surface-flat p-4"><div className="section-heading">Next step</div><div className="mt-3"><SlaBadge lead={lead} detailed /></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setLogOpen(true)} className="button-primary button-sm"><Phone className="h-3.5 w-3.5" /> Contact</button><button type="button" onClick={() => setWaOpen(true)} className="button-secondary button-sm"><MessageSquare className="h-3.5 w-3.5" /> Message</button></div></section>

          <section className="surface-flat p-4"><div className="section-heading">At a glance</div><div className="mt-3 space-y-3"><div className="flex items-center gap-2 text-xs text-zinc-600"><UserRound className="h-3.5 w-3.5 text-zinc-400" /><span>{owner?.full_name || 'Unassigned'}</span></div><div className="flex items-center gap-2 text-xs text-zinc-600"><Users className="h-3.5 w-3.5 text-zinc-400" /><span>{lead.pax_adults + lead.pax_children + lead.pax_infants} travelers</span></div><div className="flex items-center gap-2 text-xs text-zinc-600"><CalendarDays className="h-3.5 w-3.5 text-zinc-400" /><span>{lead.travel_dates || 'Flexible dates'}</span></div><div className="flex items-center gap-2 text-xs text-zinc-600"><Receipt className="h-3.5 w-3.5 text-zinc-400" /><span className="font-mono">{formatCurrency(packageValue)}</span></div><div className="flex items-center gap-2 text-xs text-zinc-600"><ShieldCheck className="h-3.5 w-3.5 text-zinc-400" /><span>{documents.length} documents</span></div></div></section>

          <button type="button" onClick={() => setActiveTab('details')} className="surface-flat flex min-h-[44px] w-full items-center justify-between gap-3 p-4 text-left text-xs font-semibold text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50"><span>View all opportunity details</span><span className="text-[9px] uppercase text-zinc-400">Same page</span></button>
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

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/store';
import {
  LeadStage,
  ActivityType,
  FollowUpChannel,
  ItineraryDay,
  PaymentMilestone,
  PaymentRecord,
  PaymentMethod,
  TravelerPassenger,
  TravelerDocument,
  LeadSupplierPayable,
  TripLifecycleStatus,
  PreDepartureChecklist,
  PostTripReview,
  MealPlanCode,
  VisaStatus,
  DmcPaymentStatus,
} from '@/lib/types';
import dynamic from 'next/dynamic';
import SlaBadge from '@/components/leads/SlaBadge';
import QuickLogModal from '@/components/leads/QuickLogModal';
import WhatsAppModal from '@/components/leads/WhatsAppModal';
import WinDealModal from '@/components/leads/WinDealModal';
import LostDealModal from '@/components/leads/LostDealModal';

const QuoteBuilderModal = dynamic(() => import('@/components/leads/QuoteBuilderModal'), { ssr: false });
const PaymentReceiptModal = dynamic(() => import('@/components/leads/PaymentReceiptModal'), { ssr: false });
const ItineraryDayModal = dynamic(() => import('@/components/leads/ItineraryDayModal'), { ssr: false });
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plane,
  FileText,
  UserCheck,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Plus,
  Printer,
  FileCheck,
  Copy,
  Check,
  Star,
  Hotel,
  Utensils,
  CreditCard,
  Building2,
  Trash2,
  Compass,
  CheckSquare,
  Square,
  Receipt,
  User,
  ExternalLink,
  ShieldCheck,
  Edit,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';

type DetailTab = 'timeline' | 'itinerary' | 'payments' | 'documents' | 'operations';

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const {
    leads,
    allLeads,
    allProfiles,
    activities,
    updateLeadStage,
    assignLead,
    logActivity,
    currentUser,
    formatCurrency,
    formatAppDate,
    addPaymentRecord,
    updatePaymentMilestones,
    updateItineraryDays,
    addPassenger,
    updatePassenger,
    deletePassenger,
    addDocument,
    deleteDocument,
    updatePreDepartureChecklist,
    updateSupplierPayables,
    recordPostTripReview,
    updateTripStatus,
  } = useApp();

  // Find lead
  const lead = allLeads.find((l) => l.id === leadId);

  useEffect(() => {
    if (lead) {
      document.title = `${lead.customer_name} (${lead.lead_code}) · ${lead.destination} — Wanderlust CRM`;
    } else {
      document.title = 'Lead Details — Wanderlust CRM';
    }
  }, [lead]);

  const [activeTab, setActiveTab] = useState<DetailTab>('timeline');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);
  const [isWinModalOpen, setIsWinModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');

  // Operational Modals State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<PaymentRecord | null>(null);
  const [isItineraryModalOpen, setIsItineraryModalOpen] = useState(false);
  const [dayToEdit, setDayToEdit] = useState<ItineraryDay | null>(null);
  const [copiedProposal, setCopiedProposal] = useState(false);

  // Record Payment Form State
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Add Passenger Form State
  const [isAddPassengerOpen, setIsAddPassengerOpen] = useState(false);
  const [paxName, setPaxName] = useState('');
  const [paxType, setPaxType] = useState<'adult' | 'child' | 'infant'>('adult');
  const [paxPassport, setPaxPassport] = useState('');
  const [paxCountry, setPaxCountry] = useState('India');
  const [paxExpiry, setPaxExpiry] = useState('');
  const [paxVisa, setPaxVisa] = useState<VisaStatus>('visa_on_arrival');
  const [paxDiet, setPaxDiet] = useState('Vegetarian');
  const [paxNotes, setPaxNotes] = useState('');

  // Add Document Form State
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<'passport' | 'visa' | 'ticket' | 'hotel_voucher' | 'insurance' | 'other'>('passport');
  const [docFileName, setDocFileName] = useState('');

  // Supplier Form State
  const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supService, setSupService] = useState('');
  const [supPayable, setSupPayable] = useState('');
  const [supPaid, setSupPaid] = useState('');
  const [supStatus, setSupStatus] = useState<DmcPaymentStatus>('advance_paid');
  const [supVoucher, setSupVoucher] = useState('');

  // Post-Trip Review State
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewNps, setReviewNps] = useState(9);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewRepeat, setReviewRepeat] = useState(true);

  // Inline quick note
  const [inlineNote, setInlineNote] = useState('');

  if (!lead) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-lg font-bold text-zinc-800">Travel Lead Not Found</h2>
        <p className="text-xs text-zinc-500 mt-1">This lead may have been deleted or you may not have permission to view it.</p>
        <Link
          href="/leads"
          className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 bg-zinc-900 text-zinc-50 rounded-md text-xs font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Pipeline
        </Link>
      </div>
    );
  }

  const assignedAgent = allProfiles.find((p) => p.id === lead.assigned_to);
  const leadActivities = activities.filter((a) => a.lead_id === lead.id);

  const handleStageChange = (newStage: LeadStage) => {
    if (newStage === 'quote_sent') {
      setIsQuoteModalOpen(true);
      return;
    }
    if (newStage === 'won') {
      setIsWinModalOpen(true);
      return;
    }
    if (newStage === 'lost') {
      setIsLostModalOpen(true);
      return;
    }
    updateLeadStage(lead.id, newStage);
  };

  const handleReassign = () => {
    if (selectedAgentId) {
      assignLead(lead.id, selectedAgentId);
      setIsReassigning(false);
    }
  };

  const handleInlineNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineNote.trim()) return;

    logActivity({
      leadId: lead.id,
      type: 'note',
      title: 'Agent Note Added',
      notes: inlineNote.trim(),
    });

    setInlineNote('');
  };

  const rescheduleNextFollowUp = (hoursFromNow: number) => {
    const nextDate = new Date(Date.now() + hoursFromNow * 3600000).toISOString();
    logActivity({
      leadId: lead.id,
      type: 'system',
      title: `Next Follow-Up Rescheduled`,
      notes: `Rescheduled to ${new Date(nextDate).toLocaleString()}`,
      nextFollowUp: {
        scheduled_at: nextDate,
        channel: 'call',
        title: `Follow-up with ${lead.customer_name}`,
      },
    });
  };

  // Tab 2: Itinerary Handlers
  const handleSaveItineraryDay = (newDay: ItineraryDay) => {
    const existing = lead.itinerary_days || [];
    const index = existing.findIndex((d) => d.id === newDay.id);
    let updated: ItineraryDay[];
    if (index >= 0) {
      updated = existing.map((d) => (d.id === newDay.id ? newDay : d));
    } else {
      updated = [...existing, newDay];
    }
    updated.sort((a, b) => a.day_number - b.day_number);
    updateItineraryDays(lead.id, updated);
  };

  const handleDeleteItineraryDay = (dayId: string) => {
    const updated = (lead.itinerary_days || []).filter((d) => d.id !== dayId);
    updateItineraryDays(lead.id, updated);
  };

  const handleCopyWhatsAppProposal = () => {
    const days = lead.itinerary_days || [];
    const text =
      `🌴 *CUSTOM TRAVEL ITINERARY FOR ${lead.customer_name.toUpperCase()}*\n` +
      `📍 *Destination:* ${lead.destination} (${lead.duration_days} Days)\n` +
      `✈️ *Dates:* ${lead.travel_dates || 'Flexible'}\n\n` +
      days
        .map(
          (d) =>
            `*Day ${d.day_number}: ${d.title}*\n🏨 Hotel: ${d.hotel_name || 'Standard'} (Meal Plan: ${d.meal_plan})\n` +
            d.activities.map((a) => `  • ${a}`).join('\n')
        )
        .join('\n\n') +
      `\n\n💰 *Total Package Investment:* ${formatCurrency(
        (lead.package_sale_price || lead.won_deal_value) || 0
      )}\n\n_Generated by Wanderlust Travel CRM_`;

    navigator.clipboard.writeText(text);
    setCopiedProposal(true);
    setTimeout(() => setCopiedProposal(false), 2000);
  };

  // Tab 3: Payment Handlers
  const totalPaid = (lead.payment_records || []).reduce((sum, r) => sum + r.amount, 0);
  const totalPackagePrice = (lead.package_sale_price || lead.won_deal_value) || 0;
  const balanceRemaining = Math.max(0, totalPackagePrice - totalPaid);

  const handleRecordPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(payAmount);
    if (!amountNum || amountNum <= 0) return;

    const newRecord = addPaymentRecord(lead.id, {
      amount: amountNum,
      method: payMethod,
      reference_no: payRef.trim() || undefined,
      notes: payNotes.trim() || undefined,
    });

    setPayAmount('');
    setPayRef('');
    setPayNotes('');
    setIsRecordPaymentOpen(false);
    setSelectedPaymentForReceipt(newRecord);
    setIsReceiptModalOpen(true);
  };

  // Tab 4: Passenger & Document Handlers
  const handleAddPassengerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paxName.trim()) return;

    addPassenger(lead.id, {
      full_name: paxName.trim(),
      type: paxType,
      passport_number: paxPassport.trim() || undefined,
      passport_country: paxCountry.trim() || undefined,
      passport_expiry_date: paxExpiry || undefined,
      visa_status: paxVisa,
      dietary_preference: paxDiet.trim() || undefined,
      special_notes: paxNotes.trim() || undefined,
    });

    setPaxName('');
    setPaxPassport('');
    setPaxExpiry('');
    setPaxNotes('');
    setIsAddPassengerOpen(false);
  };

  const handleAddDocumentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !docFileName.trim()) return;

    addDocument(lead.id, {
      title: docTitle.trim(),
      category: docCategory,
      file_name: docFileName.trim(),
      file_size: '1.2 MB',
    });

    setDocTitle('');
    setDocFileName('');
    setIsAddDocOpen(false);
  };

  // Tab 5: DMC Operations & Pre-Departure Handlers
  const handleSaveSupplierPayables = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;

    const newPayable: LeadSupplierPayable = {
      id: `sp-${Date.now()}`,
      lead_id: lead.id,
      supplier_name: supName.trim(),
      service_description: supService.trim() || 'Ground transportation & touring',
      amount_payable: Number(supPayable) || 0,
      amount_paid: Number(supPaid) || 0,
      status: supStatus,
      confirmation_voucher_no: supVoucher.trim() || undefined,
      due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    };

    updateSupplierPayables(lead.id, [...(lead.supplier_payables || []), newPayable]);
    setSupName('');
    setSupService('');
    setSupPayable('');
    setSupPaid('');
    setSupVoucher('');
    setIsEditSupplierOpen(false);
  };

  const handleToggleChecklist = (key: keyof PreDepartureChecklist) => {
    const current = lead.checklist || {
      flights_ticketed: false,
      hotel_vouchers_issued: false,
      passports_verified_6months: false,
      visas_confirmed: false,
      travel_insurance_issued: false,
      web_checkin_completed: false,
      emergency_contacts_dispatched: false,
    };
    updatePreDepartureChecklist(lead.id, { [key]: !current[key] });
  };

  const handleSavePostTripReview = (e: React.FormEvent) => {
    e.preventDefault();
    recordPostTripReview(lead.id, {
      rating: reviewRating,
      nps_score: reviewNps,
      feedback_notes: reviewNotes.trim() || undefined,
      repeat_interest: reviewRepeat,
    });
  };

  const detailTabs: { id: DetailTab; label: string; count?: number; icon: any }[] = [
    { id: 'timeline', label: 'Timeline & Notes', count: leadActivities.length, icon: Clock },
    { id: 'itinerary', label: 'Itinerary Plan', count: (lead.itinerary_days || []).length, icon: Calendar },
    { id: 'payments', label: 'Payments & Ledger', count: (lead.payment_records || []).length, icon: DollarSign },
    { id: 'documents', label: 'Passports & Vault', count: (lead.passengers || []).length, icon: ShieldAlert },
    { id: 'operations', label: 'DMC & Readiness', icon: Plane },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Top Bar Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <Link
            href="/leads"
            aria-label="Back to leads pipeline"
            className="p-1.5 rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-zinc-400">
                {lead.lead_code}
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    lead.priority === 'urgent'
                      ? 'bg-red-500'
                      : lead.priority === 'high'
                      ? 'bg-amber-500'
                      : 'bg-zinc-400'
                  }`}
                />
                <span className="capitalize">{lead.priority} Priority</span>
              </div>
            </div>
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight mt-0.5">
              {lead.customer_name}
            </h1>
          </div>
        </div>

        {/* Stage Selector & Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Stage Dropdown */}
          <select
            value={lead.stage}
            aria-label="Update lead stage"
            onChange={(e) => handleStageChange(e.target.value as LeadStage)}
            className="text-xs font-medium bg-zinc-50 border border-zinc-200 rounded-md px-2.5 py-1.5 text-zinc-800 focus:outline-none"
          >
            <option value="new">Stage: New Inquiry</option>
            <option value="contacted">Stage: Contacted</option>
            <option value="quote_sent">Stage: Quote Sent</option>
            <option value="in_negotiation">Stage: In Negotiation</option>
            <option value="won">Stage: Won (Closed)</option>
            <option value="lost">Stage: Lost / Closed</option>
          </select>

          {/* 1-Click WhatsApp */}
          <button
            onClick={() => setIsWaModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-md text-xs font-medium transition"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp</span>
          </button>

          {/* Quotation Proposal */}
          <button
            onClick={() => setIsQuoteModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-md text-xs font-medium transition"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>{lead.latest_quote ? 'Edit Quote' : 'Quotation'}</span>
          </button>

          {/* 1-Click Call / Log */}
          <button
            onClick={() => setIsLogModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Log Call</span>
          </button>
        </div>
      </div>

      {/* SLA & Follow-up Alert Banner */}
      <div className="bg-white rounded-lg p-3 border border-zinc-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SlaBadge lead={lead} detailed />
          <div className="text-xs text-zinc-600">
            {lead.first_contacted_at ? (
              <span>
                First touched in{' '}
                <strong className="text-zinc-900 font-mono">
                  {Math.round((lead.first_response_time_seconds || 0) / 60)}m
                </strong>
                .
              </span>
            ) : (
              <span>First response SLA is active. Target contact time is &lt;30m.</span>
            )}
          </div>
        </div>

        {/* Next Follow-Up reschedule shortcuts */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-zinc-500 font-medium">Quick Reschedule:</span>
          <button
            onClick={() => rescheduleNextFollowUp(2)}
            className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 rounded text-zinc-700 font-mono text-[11px] font-medium transition"
          >
            +2h
          </button>
          <button
            onClick={() => rescheduleNextFollowUp(24)}
            className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 rounded text-zinc-700 font-mono text-[11px] font-medium transition"
          >
            Tomorrow
          </button>
          <button
            onClick={() => rescheduleNextFollowUp(72)}
            className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 rounded text-zinc-700 font-mono text-[11px] font-medium transition"
          >
            +3d
          </button>
        </div>
      </div>

      {/* 2-Column Main Dossier & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Traveler Dossier (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Assignment Card */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight">
                Assigned Consultant
              </span>
              {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
                <button
                  onClick={() => setIsReassigning(!isReassigning)}
                  className="text-xs text-zinc-600 hover:text-zinc-900 font-medium underline"
                >
                  {isReassigning ? 'Cancel' : 'Reassign'}
                </button>
              )}
            </div>

            {isReassigning ? (
              <div className="space-y-2 pt-1">
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded-md p-2 bg-zinc-50 focus:outline-none"
                >
                  <option value="">Select Consultant...</option>
                  {allProfiles
                    .filter((p) => p.role === 'agent')
                    .map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.full_name} ({ag.destination_tags.join(', ')})
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleReassign}
                  className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium"
                >
                  Confirm Reassignment
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {assignedAgent ? (
                  <>
                    <img
                      src={assignedAgent.avatar_url}
                      alt={assignedAgent.full_name}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-200"
                    />
                    <div>
                      <Link
                        href={`/team/${assignedAgent.id}`}
                        className="font-medium text-zinc-900 text-xs hover:underline block"
                      >
                        {assignedAgent.full_name}
                      </Link>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {assignedAgent.email} • {assignedAgent.destination_tags.slice(0, 2).join(', ')}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-red-600 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Unassigned - In general queue
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Itinerary Proposal / Quotation Card */}
          {lead.latest_quote && (
            <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-semibold text-zinc-900 tracking-tight">
                    Active Proposal ({lead.latest_quote.quote_number})
                  </h3>
                </div>
                <button
                  onClick={() => setIsQuoteModalOpen(true)}
                  className="text-[11px] font-medium text-blue-600 hover:underline"
                >
                  Revise Quote
                </button>
              </div>

              <div className="text-xs font-medium text-zinc-800">
                {lead.latest_quote.package_title}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block font-sans">Selling Price</span>
                  <span className="font-bold text-zinc-900 text-sm">
                    ${lead.latest_quote.total_selling_price.toLocaleString()}
                  </span>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block font-sans">Supplier Cost</span>
                  <span className="text-zinc-600 text-sm">
                    ${lead.latest_quote.total_supplier_cost.toLocaleString()}
                  </span>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block font-sans">Gross Profit</span>
                  <span className="text-emerald-700 font-bold text-sm">
                    +${lead.latest_quote.gross_profit.toLocaleString()} ({lead.latest_quote.profit_margin_pct}%)
                  </span>
                </div>
                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block font-sans">Estimated Comm.</span>
                  <span className="text-amber-700 font-bold text-sm">
                    ${lead.latest_quote.commission_earned.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 flex justify-between pt-1 border-t border-zinc-100">
                <span>Valid for {lead.latest_quote.validity_days} days</span>
                <span>{lead.latest_quote.line_items.length} line items</span>
              </div>
            </div>
          )}

          {/* Deal Financials & Incentive Card (Linear/Attio-grade) */}
          {lead.stage === 'won' && (
            <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-semibold text-zinc-900 tracking-tight">
                    Deal Financials & Commission
                  </h3>
                </div>
                <button
                  onClick={() => setIsWinModalOpen(true)}
                  className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 underline"
                >
                  Edit Financials
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">Sale Price</span>
                  <span className="font-mono font-medium text-zinc-900 text-sm">
                    ${((lead.package_sale_price || lead.won_deal_value) || 0).toLocaleString()}
                  </span>
                </div>

                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">Net Vendor Cost</span>
                  <span className="font-mono font-medium text-zinc-900 text-sm">
                    ${(lead.vendor_net_cost || 0).toLocaleString()}
                  </span>
                </div>

                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">Gross Profit</span>
                  <span className="font-mono font-medium text-emerald-700 text-sm">
                    +${(lead.gross_profit || 0).toLocaleString()}
                  </span>
                </div>

                <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">Profit Margin</span>
                  <div className="flex items-center gap-1 font-mono font-medium text-sm text-zinc-900">
                    <span>{lead.profit_margin_pct ?? 0}%</span>
                    {typeof lead.profit_margin_pct === 'number' && lead.profit_margin_pct < 10 && (
                      <span className="text-[9px] text-amber-700 font-sans font-medium px-1 bg-amber-50 rounded">Gate &lt;10%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Commission status banner */}
              <div className="p-3 rounded-md bg-zinc-900 text-zinc-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase tracking-tight">Agent Commission Earned</div>
                  <div className="font-mono text-base font-medium text-white">
                    ${(lead.agent_commission_earned || 0).toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    lead.commission_status === 'paid'
                      ? 'bg-emerald-400'
                      : lead.commission_status === 'approved'
                      ? 'bg-blue-400'
                      : 'bg-amber-400'
                  }`} />
                  <span className="capitalize">{lead.commission_status || 'accrued'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Lost Deal Debrief Card */}
          {lead.stage === 'lost' && (
            <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <h3 className="text-xs font-semibold text-zinc-900 tracking-tight">
                    Lost Deal Debrief
                  </h3>
                </div>
                <button
                  onClick={() => setIsLostModalOpen(true)}
                  className="text-[11px] font-medium text-zinc-600 hover:text-zinc-900 underline"
                >
                  Edit Reason
                </button>
              </div>

              <div className="bg-zinc-50 p-3 rounded border border-zinc-200 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">Primary Loss Factor</span>
                  <span className="font-mono font-medium text-red-700 capitalize">
                    {lead.lost_reason ? lead.lost_reason.replace(/_/g, ' ') : 'Unspecified'}
                  </span>
                </div>
                {lead.lost_notes && (
                  <div>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">Debrief Notes</span>
                    <p className="text-zinc-700 italic mt-0.5 whitespace-pre-wrap font-sans text-xs">
                      "{lead.lost_notes}"
                    </p>
                  </div>
                )}
                {lead.closed_at && (
                  <div suppressHydrationWarning className="pt-1 text-[10px] font-mono text-zinc-400">
                    Closed on: {formatAppDate(lead.closed_at)}
                  </div>
                )}
              </div>

              <button
                onClick={() => updateLeadStage(lead.id, 'in_negotiation')}
                className="w-full py-1.5 rounded-md border border-zinc-200 hover:bg-zinc-50 font-medium text-xs text-zinc-700 transition"
              >
                Reopen & Move to Negotiation
              </button>
            </div>
          )}

          {/* Traveler Requirements Card */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-zinc-600" /> Trip Parameters & Requirements
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">
                  Destination
                </span>
                <span className="font-semibold text-zinc-900">{lead.destination}</span>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">
                  Estimated Budget
                </span>
                <span className="font-mono font-medium text-zinc-900">{lead.budget_range || 'Flexible'}</span>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">
                  Travel Dates
                </span>
                <span className="font-medium text-zinc-800">{lead.travel_dates || 'Flexible'}</span>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">
                  Travelers (Pax)
                </span>
                <span className="font-medium text-zinc-800">
                  {lead.pax_adults} Adults {lead.pax_children ? `, ${lead.pax_children} Children` : ''}
                </span>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">
                  Holiday Style
                </span>
                <span className="font-medium text-zinc-800 capitalize">{lead.travel_type}</span>
              </div>

              <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200">
                <span className="text-zinc-400 block text-[10px] uppercase font-medium">
                  Hotel Category
                </span>
                <span className="font-medium text-zinc-800 capitalize">{lead.hotel_category || '4-star'}</span>
              </div>
            </div>

            {/* Flight & Visa flags */}
            <div className="flex gap-2 pt-1 border-t border-zinc-100 text-xs">
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${lead.flight_required ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-zinc-100/50 border-zinc-200/50 text-zinc-400'}`}>
                {lead.flight_required ? '✓ Flights Required' : 'No Flights Needed'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${lead.visa_required ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-zinc-100/50 border-zinc-200/50 text-zinc-400'}`}>
                {lead.visa_required ? '✓ Visa Assistance' : 'Visa Not Required'}
              </span>
            </div>

            {/* Special Notes */}
            {lead.special_notes && (
              <div className="pt-2 border-t border-zinc-100">
                <span className="text-[10px] uppercase font-semibold text-zinc-400 block mb-1">
                  Customer Preferences & Notes
                </span>
                <p className="text-xs text-zinc-700 bg-amber-50/50 p-2.5 rounded border border-amber-200/60 leading-relaxed italic">
                  "{lead.special_notes}"
                </p>
              </div>
            )}
          </div>

          {/* Contact Details Card */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-2.5">
            <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight">
              Contact & Ingestion Info
            </h3>
            <div className="space-y-2 text-xs text-zinc-700">
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">Phone:</span>
                <a href={`tel:${lead.customer_phone}`} className="font-mono font-medium text-zinc-900 hover:underline">
                  {lead.customer_phone}
                </a>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">Email:</span>
                <span className="font-mono text-zinc-800">{lead.customer_email || 'Not provided'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-400">City / Country:</span>
                <span>{lead.customer_city || 'Unknown'}, {lead.customer_country}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-400">Source:</span>
                <span className="font-medium capitalize text-zinc-900">{lead.source}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 5 Operational Tabs (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sub-Tab Navigation Bar */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 pb-px">
            {detailTabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  aria-label={`Switch to ${t.label} tab`}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition border-b-2 whitespace-nowrap min-h-[38px] cursor-pointer ${
                    isActive
                      ? 'border-zinc-950 text-zinc-950 bg-white font-semibold'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`} />
                  <span>{t.label}</span>
                  {typeof t.count === 'number' && t.count > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: Timeline & Notes */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* Inline Activity / Note Composer */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs">
                <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight mb-2">
                  Add Quick Interaction Note
                </h3>
                <form onSubmit={handleInlineNoteSubmit} className="space-y-2.5">
                  <textarea
                    rows={3}
                    value={inlineNote}
                    onChange={(e) => setInlineNote(e.target.value)}
                    placeholder="Log discussion notes, itinerary feedback, follow-up progress..."
                    aria-label="Lead interaction note"
                    className="w-full text-xs border border-zinc-200 rounded-md p-2.5 bg-zinc-50 focus:bg-white focus:outline-none resize-none leading-relaxed"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsWaModalOpen(true)}
                        aria-label="Send WhatsApp message"
                        className="text-xs flex items-center gap-1.5 text-zinc-700 font-medium px-2.5 py-1 hover:bg-zinc-100 rounded border border-zinc-200 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsLogModalOpen(true)}
                        aria-label="Log phone call"
                        className="text-xs flex items-center gap-1.5 text-zinc-700 font-medium px-2.5 py-1 hover:bg-zinc-100 rounded border border-zinc-200 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 text-zinc-600" /> Log Call
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={!inlineNote.trim()}
                      aria-label="Post note"
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-50 rounded-md text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" /> Post Note
                    </button>
                  </div>
                </form>
              </div>

              {/* Activity Timeline */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs">
                <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight mb-3 flex items-center justify-between">
                  <span>Chronological Activity & Follow-Up History</span>
                  <span className="font-mono text-zinc-500 font-normal">
                    {leadActivities.length} logs
                  </span>
                </h3>

                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-px before:bg-zinc-200">
                  {leadActivities.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-400 font-mono">
                      No activities logged yet. Log a call or send WhatsApp to advance the deal!
                    </div>
                  ) : (
                    leadActivities.map((act) => {
                      const actAgent = allProfiles.find((p) => p.id === act.agent_id);

                      return (
                        <div key={act.id} className="flex items-start gap-3 relative z-10">
                          {/* Icon */}
                          <div
                            className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 border ${
                              act.activity_type === 'call'
                                ? 'bg-zinc-100 border-zinc-200 text-zinc-800'
                                : act.activity_type === 'whatsapp'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : act.activity_type === 'payment'
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : act.activity_type === 'stage_change'
                                ? 'bg-zinc-900 border-zinc-900 text-zinc-100'
                                : act.activity_type === 'reassignment'
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                            }`}
                          >
                            {act.activity_type === 'call' ? (
                              <Phone className="w-3.5 h-3.5" />
                            ) : act.activity_type === 'whatsapp' ? (
                              <MessageSquare className="w-3.5 h-3.5" />
                            ) : act.activity_type === 'payment' ? (
                              <DollarSign className="w-3.5 h-3.5" />
                            ) : act.activity_type === 'stage_change' ? (
                              <Sparkles className="w-3.5 h-3.5" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                          </div>

                          {/* Content Card */}
                          <div className="flex-1 bg-zinc-50 rounded-md p-3 border border-zinc-200/80">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <div className="font-semibold text-zinc-900">{act.title}</div>
                              <span suppressHydrationWarning className="text-[10px] font-mono text-zinc-400">
                                {formatAppDate(act.created_at)}
                              </span>
                            </div>

                            {act.outcome && (
                              <span className="inline-block text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-800 mb-1">
                                Outcome: {act.outcome}
                              </span>
                            )}

                            {act.notes && (
                              <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">
                                {act.notes}
                              </p>
                            )}

                            <div className="mt-2 text-[10px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-200/60 font-mono">
                              <span>Logged by: {actAgent ? actAgent.full_name : 'System'}</span>
                              {act.call_duration_seconds && (
                                <span>Duration: {Math.round(act.call_duration_seconds / 60)}m</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Day-by-Day Itinerary */}
          {activeTab === 'itinerary' && (
            <div className="space-y-4 text-xs">
              {/* Toolbar Bar */}
              <div className="bg-white rounded-lg p-3.5 border border-zinc-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-zinc-600" />
                    <span>Day-by-Day Travel Schedule</span>
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {lead.destination} • {lead.duration_days} Days ({lead.itinerary_days?.length || 0} days scheduled)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWhatsAppProposal}
                    aria-label="Copy itinerary proposal for WhatsApp"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-md text-xs font-medium transition cursor-pointer"
                  >
                    {copiedProposal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedProposal ? 'Copied!' : 'WhatsApp Proposal'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDayToEdit(null);
                      setIsItineraryModalOpen(true);
                    }}
                    aria-label="Add day to itinerary"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Day</span>
                  </button>
                </div>
              </div>

              {/* Itinerary Days List */}
              {(!lead.itinerary_days || lead.itinerary_days.length === 0) ? (
                <div className="bg-white rounded-lg p-8 border border-zinc-200 text-center space-y-3">
                  <Calendar className="w-8 h-8 text-zinc-300 mx-auto" />
                  <p className="text-xs text-zinc-500">No daily itinerary generated for this inquiry yet.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDayToEdit(null);
                      setIsItineraryModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-zinc-900 text-white rounded-md text-xs font-medium"
                  >
                    Create Day 1 Itinerary
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {lead.itinerary_days.map((day) => (
                    <div
                      key={day.id}
                      className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-zinc-900 text-white font-mono text-[10px] font-bold">
                              Day {day.day_number}
                            </span>
                            <h4 className="font-semibold text-zinc-900 text-xs">{day.title}</h4>
                          </div>
                          <p className="text-[11px] text-zinc-600 leading-relaxed">{day.description}</p>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setDayToEdit(day);
                              setIsItineraryModalOpen(true);
                            }}
                            aria-label={`Edit Day ${day.day_number}`}
                            className="text-zinc-400 hover:text-zinc-700 p-1"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItineraryDay(day.id)}
                            aria-label={`Delete Day ${day.day_number}`}
                            className="text-zinc-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Hotel & Meal Plan Badges */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100 text-[11px]">
                        {day.hotel_name && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-700">
                            <Hotel className="w-3 h-3 text-zinc-500" />
                            <span>{day.hotel_name}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-700 font-mono">
                          <Utensils className="w-3 h-3 text-zinc-500" />
                          <span>
                            Plan: {day.meal_plan} (
                            {day.meal_plan === 'EP'
                              ? 'Room Only'
                              : day.meal_plan === 'CP'
                              ? 'Breakfast'
                              : day.meal_plan === 'MAP'
                              ? 'Breakfast + Dinner'
                              : day.meal_plan === 'AP'
                              ? 'All Meals'
                              : 'All Inclusive'}
                            )
                          </span>
                        </span>
                      </div>

                      {/* Activities Highlights */}
                      {day.activities && day.activities.length > 0 && (
                        <div className="space-y-1 pt-1 bg-zinc-50/50 p-2.5 rounded border border-zinc-100">
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight block">
                            Daily Program Highlights
                          </span>
                          <ul className="space-y-1 text-[11px] text-zinc-700">
                            {day.activities.map((act, idx) => (
                              <li key={idx} className="flex items-start gap-1.5">
                                <span className="text-zinc-400">•</span>
                                <span>{act}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Payments & Milestones */}
          {activeTab === 'payments' && (
            <div className="space-y-4 text-xs">
              {/* Financial Progress Banner */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-zinc-600" />
                      <span>Payment Milestones & Client Ledger</span>
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Track installments, booking deposits, and download authenticated vouchers
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsRecordPaymentOpen(!isRecordPaymentOpen)}
                    aria-label="Record client payment"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record Payment</span>
                  </button>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
                  <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200 font-mono">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block font-sans">
                      Total Package Price
                    </span>
                    <span className="text-base font-bold text-zinc-900">
                      {formatCurrency(totalPackagePrice)}
                    </span>
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200 font-mono">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block font-sans">
                      Total Received
                    </span>
                    <span className="text-base font-bold text-emerald-700">
                      {formatCurrency(totalPaid)}
                    </span>
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200 font-mono">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-tight block font-sans">
                      Balance Due
                    </span>
                    <span className={`text-base font-bold ${balanceRemaining === 0 ? 'text-emerald-700' : 'text-zinc-900'}`}>
                      {balanceRemaining === 0 ? 'PAID IN FULL ✓' : formatCurrency(balanceRemaining)}
                    </span>
                  </div>
                </div>

                {/* Linear-grade Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                    <span>Payment Progress</span>
                    <span>
                      {totalPackagePrice > 0 ? Math.round((totalPaid / totalPackagePrice) * 100) : 0}% Paid
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-100 overflow-hidden border border-zinc-200 flex">
                    <div
                      className="bg-emerald-600 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          totalPackagePrice > 0 ? (totalPaid / totalPackagePrice) * 100 : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Record Payment Form Drawer (when active) */}
              {isRecordPaymentOpen && (
                <form
                  onSubmit={handleRecordPaymentSubmit}
                  className="bg-zinc-50 p-4 rounded-lg border border-zinc-300 shadow-2xs space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                    <span className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-emerald-600" />
                      <span>Record Inward Client Payment</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsRecordPaymentOpen(false)}
                      className="text-zinc-400 hover:text-zinc-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700 block">Amount ($)</label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={balanceRemaining > 0 ? String(balanceRemaining) : '500'}
                        className="w-full border border-zinc-200 rounded p-1.5 font-mono font-bold text-xs bg-white"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700 block">Payment Method</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                        className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white capitalize"
                      >
                        <option value="bank_transfer">Bank Transfer (Wire/NEFT)</option>
                        <option value="credit_card">Credit Card (POS/Gateway)</option>
                        <option value="stripe">Stripe Checkout Link</option>
                        <option value="upi">UPI / Instant QR</option>
                        <option value="cash">Direct Cash</option>
                        <option value="cheque">Bank Cheque</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700 block">Transaction Reference</label>
                      <input
                        type="text"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                        placeholder="e.g. HDFC-WIRE-9921"
                        className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-700 block">Payment Notes / Remark</label>
                    <input
                      type="text"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="e.g. Deposit to block non-refundable resort rate"
                      className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsRecordPaymentOpen(false)}
                      className="px-3 py-1.5 border border-zinc-200 rounded text-xs text-zinc-600 hover:bg-zinc-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-medium shadow-2xs"
                    >
                      Save & Issue Receipt
                    </button>
                  </div>
                </form>
              )}

              {/* Milestones Schedule */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight">
                  Milestone Payment Schedule
                </h4>

                <div className="space-y-2">
                  {(lead.payment_milestones || []).length === 0 ? (
                    <div className="p-3 text-zinc-400 text-center font-mono text-xs bg-zinc-50 rounded">
                      Standard milestone breakdown will automatically apply upon deal closure.
                    </div>
                  ) : (
                    lead.payment_milestones?.map((ms) => (
                      <div
                        key={ms.id}
                        className="flex items-center justify-between p-2.5 bg-zinc-50 rounded-md border border-zinc-200"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              ms.status === 'paid' ? 'bg-emerald-500' : 'bg-amber-400'
                            }`}
                          />
                          <div>
                            <span className="font-semibold text-zinc-900 block">{ms.title}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              Due: {ms.due_date} {ms.notes ? `• ${ms.notes}` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <span className="font-bold text-zinc-900 block">
                            {formatCurrency(ms.amount)}
                          </span>
                          <span
                            className={`text-[10px] uppercase font-sans font-medium ${
                              ms.status === 'paid' ? 'text-emerald-700' : 'text-zinc-500'
                            }`}
                          >
                            {ms.status === 'paid' ? 'Paid ✓' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recorded Payments Table */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight">
                  Client Payment Receipts Ledger
                </h4>

                {(!lead.payment_records || lead.payment_records.length === 0) ? (
                  <div className="py-6 text-center text-zinc-400 font-mono text-xs">
                    No inward payments recorded yet.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {lead.payment_records.map((rec) => (
                      <div key={rec.id} className="py-2.5 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-zinc-900 text-xs">
                              {rec.receipt_number}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 uppercase">
                              {rec.method.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-400 font-mono block">
                            {formatAppDate(rec.received_at)} {rec.reference_no ? `• Ref: ${rec.reference_no}` : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-emerald-700 text-sm">
                            +{formatCurrency(rec.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPaymentForReceipt(rec);
                              setIsReceiptModalOpen(true);
                            }}
                            aria-label={`View receipt ${rec.receipt_number}`}
                            className="flex items-center gap-1 px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded text-[11px] font-medium transition cursor-pointer"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Voucher</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Passports & Documents Vault */}
          {activeTab === 'documents' && (
            <div className="space-y-4 text-xs">
              {/* Passenger Roster Card */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div>
                    <h3 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-zinc-600" />
                      <span>Passenger Roster & Passport Compliance</span>
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Automated 6-Month International Validity Checker against trip departure date
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddPassengerOpen(!isAddPassengerOpen)}
                    aria-label="Add passenger to booking"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Passenger</span>
                  </button>
                </div>

                {/* Add Passenger Form */}
                {isAddPassengerOpen && (
                  <form
                    onSubmit={handleAddPassengerSubmit}
                    className="p-3 bg-zinc-50 rounded-md border border-zinc-300 space-y-2.5 animate-in fade-in"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Full Name</label>
                        <input
                          type="text"
                          value={paxName}
                          onChange={(e) => setPaxName(e.target.value)}
                          placeholder="e.g. John Doe"
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Type</label>
                        <select
                          value={paxType}
                          onChange={(e) => setPaxType(e.target.value as any)}
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                        >
                          <option value="adult">Adult</option>
                          <option value="child">Child (&lt;12 yrs)</option>
                          <option value="infant">Infant (&lt;2 yrs)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Passport Number</label>
                        <input
                          type="text"
                          value={paxPassport}
                          onChange={(e) => setPaxPassport(e.target.value)}
                          placeholder="e.g. Z5928192"
                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Passport Expiry Date</label>
                        <input
                          type="date"
                          value={paxExpiry}
                          onChange={(e) => setPaxExpiry(e.target.value)}
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Visa Status</label>
                        <select
                          value={paxVisa}
                          onChange={(e) => setPaxVisa(e.target.value as VisaStatus)}
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                        >
                          <option value="not_required">Not Required / Visa Free</option>
                          <option value="visa_on_arrival">Visa On Arrival</option>
                          <option value="applied">Applied / Processing</option>
                          <option value="approved">Approved & Printed</option>
                          <option value="rejected">Rejected / Needs Review</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Dietary Preference</label>
                        <input
                          type="text"
                          value={paxDiet}
                          onChange={(e) => setPaxDiet(e.target.value)}
                          placeholder="e.g. Vegetarian, Jain, Halal"
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddPassengerOpen(false)}
                        className="px-2.5 py-1 text-zinc-600 border border-zinc-200 rounded text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-zinc-900 text-white rounded text-xs font-medium"
                      >
                        Save Passenger
                      </button>
                    </div>
                  </form>
                )}

                {/* Passengers List */}
                {(!lead.passengers || lead.passengers.length === 0) ? (
                  <div className="py-6 text-center text-zinc-400 font-mono text-xs">
                    No passenger documents entered yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lead.passengers.map((pax) => {
                      const isValid6m = pax.is_passport_valid_6months !== false;

                      return (
                        <div
                          key={pax.id}
                          className="p-3 bg-zinc-50 rounded-md border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-900">{pax.full_name}</span>
                              <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-700">
                                {pax.type}
                              </span>
                              {pax.dietary_preference && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                  {pax.dietary_preference}
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-zinc-500 font-mono flex flex-wrap items-center gap-2">
                              <span>Passport: {pax.passport_number || 'Pending'}</span>
                              {pax.passport_expiry_date && (
                                <span>Expires: {pax.passport_expiry_date}</span>
                              )}
                              <span>Visa: {pax.visa_status.replace(/_/g, ' ')}</span>
                            </div>

                            {/* 6-Month International Validity Badge */}
                            <div className="pt-0.5">
                              {isValid6m ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Passport Valid (&gt;6M from trip)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>IMMIGRATION WARNING: Passport expires in &lt;6 Months!</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => deletePassenger(lead.id, pax.id)}
                              aria-label={`Remove ${pax.full_name}`}
                              className="text-zinc-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Document Vault Card */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div>
                    <h3 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-zinc-600" />
                      <span>E-Ticket & Document Vault</span>
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Secure file storage for airline e-tickets, hotel vouchers, and travel insurance policies
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddDocOpen(!isAddDocOpen)}
                    aria-label="Upload new travel document"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Document</span>
                  </button>
                </div>

                {isAddDocOpen && (
                  <form
                    onSubmit={handleAddDocumentSubmit}
                    className="p-3 bg-zinc-50 rounded-md border border-zinc-300 space-y-2.5 animate-in fade-in"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="text-[10px] font-medium text-zinc-600 block">Document Title</label>
                        <input
                          type="text"
                          value={docTitle}
                          onChange={(e) => setDocTitle(e.target.value)}
                          placeholder="e.g. Return Flight E-Ticket"
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Category</label>
                        <select
                          value={docCategory}
                          onChange={(e) => setDocCategory(e.target.value as any)}
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white capitalize"
                        >
                          <option value="ticket">Airline Ticket</option>
                          <option value="hotel_voucher">Hotel Voucher</option>
                          <option value="passport">Passport Copy</option>
                          <option value="visa">Visa Document</option>
                          <option value="insurance">Insurance Policy</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">File Name</label>
                        <input
                          type="text"
                          value={docFileName}
                          onChange={(e) => setDocFileName(e.target.value)}
                          placeholder="e.g. e_ticket_singapore_airlines.pdf"
                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddDocOpen(false)}
                        className="px-2.5 py-1 text-zinc-600 border border-zinc-200 rounded text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-zinc-900 text-white rounded text-xs font-medium"
                      >
                        Attach Document
                      </button>
                    </div>
                  </form>
                )}

                {(!lead.documents || lead.documents.length === 0) ? (
                  <div className="py-6 text-center text-zinc-400 font-mono text-xs">
                    No travel documents attached.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {lead.documents.map((doc) => (
                      <div key={doc.id} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <div>
                            <span className="font-medium text-zinc-900 block">{doc.title}</span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              {doc.file_name} • {doc.file_size || '1.0 MB'} • {formatAppDate(doc.uploaded_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => deleteDocument(lead.id, doc.id)}
                            aria-label={`Delete ${doc.title}`}
                            className="text-zinc-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: DMC Operations & Pre-Departure Readiness */}
          {activeTab === 'operations' && (
            <div className="space-y-4 text-xs">
              {/* Trip Lifecycle Status Switcher */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div>
                  <h3 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-zinc-600" />
                    <span>Trip Lifecycle Operations Hub</span>
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Stage progression from itinerary planning to on-trip passenger tracking and post-travel review
                  </p>
                </div>

                {/* Step Switcher */}
                <div className="grid grid-cols-5 gap-1.5 bg-zinc-50 p-1 rounded-md border border-zinc-200">
                  {(['planning', 'booked', 'pre_departure', 'on_trip', 'completed'] as TripLifecycleStatus[]).map((st) => {
                    const isCur = (lead.trip_status || 'planning') === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => updateTripStatus(lead.id, st)}
                        className={`py-1.5 text-center font-mono text-[11px] rounded transition capitalize cursor-pointer ${
                          isCur
                            ? 'bg-zinc-900 text-white font-bold shadow-2xs'
                            : 'text-zinc-600 hover:bg-zinc-200/60'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    );
                  })}
                </div>

                {/* On-Trip High Visibility Badge */}
                {lead.trip_status === 'on_trip' && (
                  <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-900 font-medium">
                    <Plane className="w-4 h-4 text-emerald-600 animate-pulse" />
                    <span>✈️ TRAVELER IS CURRENTLY ON TRIP — PRIORITY ASSISTANCE & HOTLINE ACTIVE</span>
                  </div>
                )}
              </div>

              {/* 7-Step Pre-Departure Readiness Checklist */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div>
                    <h4 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-zinc-600" />
                      <span>7-Step Pre-Departure Readiness Checklist</span>
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Ensures all operational components are confirmed before traveler leaves for airport
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                    {
                      Object.values(
                        lead.checklist || {
                          flights_ticketed: false,
                          hotel_vouchers_issued: false,
                          passports_verified_6months: false,
                          visas_confirmed: false,
                          travel_insurance_issued: false,
                          web_checkin_completed: false,
                          emergency_contacts_dispatched: false,
                        }
                      ).filter(Boolean).length
                    }
                    /7 Completed
                  </span>
                </div>

                <div className="space-y-2">
                  {[
                    { key: 'flights_ticketed', label: 'International & Domestic Flight E-Tickets Confirmed' },
                    { key: 'hotel_vouchers_issued', label: 'Hotel & Resort Confirmation Vouchers Generated' },
                    { key: 'passports_verified_6months', label: 'Passports Verified for 6-Month International Validity' },
                    { key: 'visas_confirmed', label: 'Visas / E-Visas / Entry Documents Approved' },
                    { key: 'travel_insurance_issued', label: 'Comprehensive Medical & Baggage Travel Insurance Issued' },
                    { key: 'web_checkin_completed', label: 'Airline Web Check-in Completed & Boarding Passes Shared' },
                    { key: 'emergency_contacts_dispatched', label: 'Local Ground DMC Driver & 24/7 Hotline Shared with Client' },
                  ].map((item) => {
                    const isChecked = Boolean((lead.checklist as any)?.[item.key]);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleToggleChecklist(item.key as keyof PreDepartureChecklist)}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-md border text-left transition cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950 font-medium'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100/50'
                        }`}
                      >
                        {isChecked ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                        )}
                        <span className="text-xs">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ground DMC Supplier Payables */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div>
                    <h4 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-zinc-600" />
                      <span>Ground DMC Operator & Accounts Payable</span>
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Ground operator reconciliation, advances, and voucher numbers
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditSupplierOpen(!isEditSupplierOpen)}
                    aria-label="Add supplier payable"
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add DMC Payable</span>
                  </button>
                </div>

                {isEditSupplierOpen && (
                  <form
                    onSubmit={handleSaveSupplierPayables}
                    className="p-3 bg-zinc-50 rounded-md border border-zinc-300 space-y-2.5 animate-in fade-in"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">DMC / Ground Supplier</label>
                        <input
                          type="text"
                          value={supName}
                          onChange={(e) => setSupName(e.target.value)}
                          placeholder="e.g. Bali Sun DMC"
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Service Rendered</label>
                        <input
                          type="text"
                          value={supService}
                          onChange={(e) => setSupService(e.target.value)}
                          placeholder="e.g. 7D private van + Ubud tours"
                          className="w-full border border-zinc-200 rounded p-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Total Payable ($)</label>
                        <input
                          type="number"
                          value={supPayable}
                          onChange={(e) => setSupPayable(e.target.value)}
                          placeholder="850"
                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Amount Paid ($)</label>
                        <input
                          type="number"
                          value={supPaid}
                          onChange={(e) => setSupPaid(e.target.value)}
                          placeholder="350"
                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-zinc-600 block">Voucher / Confirmation #</label>
                        <input
                          type="text"
                          value={supVoucher}
                          onChange={(e) => setSupVoucher(e.target.value)}
                          placeholder="VOUCH-BALI-8821"
                          className="w-full border border-zinc-200 rounded p-1.5 font-mono text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditSupplierOpen(false)}
                        className="px-2.5 py-1 text-zinc-600 border border-zinc-200 rounded text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-zinc-900 text-white rounded text-xs font-medium"
                      >
                        Save Payable
                      </button>
                    </div>
                  </form>
                )}

                {(!lead.supplier_payables || lead.supplier_payables.length === 0) ? (
                  <div className="py-6 text-center text-zinc-400 font-mono text-xs">
                    No DMC ground supplier attached yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lead.supplier_payables.map((sp) => (
                      <div
                        key={sp.id}
                        className="p-3 bg-zinc-50 rounded-md border border-zinc-200 flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-900">{sp.supplier_name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-200 text-zinc-700 capitalize">
                              {sp.status.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-500 block">{sp.service_description}</span>
                          {sp.confirmation_voucher_no && (
                            <span className="text-[10px] font-mono text-zinc-400 block">
                              Voucher: {sp.confirmation_voucher_no}
                            </span>
                          )}
                        </div>

                        <div className="text-right font-mono">
                          <span className="font-bold text-zinc-900 block text-xs">
                            {formatCurrency(sp.amount_payable)}
                          </span>
                          <span className="text-[10px] text-emerald-700 block">
                            Paid: {formatCurrency(sp.amount_paid)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Post-Trip Review / NPS Feedback Card */}
              <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                  <div>
                    <h4 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      <span>Post-Trip Customer Feedback & NPS Retention</span>
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Record post-return client debrief, satisfaction ratings, and repeat booking readiness
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSavePostTripReview} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700 block">Overall Star Rating (1 - 5)</label>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewRating(star)}
                            className="p-1 text-amber-400 hover:scale-110 transition cursor-pointer"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-zinc-200'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="font-mono font-bold text-xs ml-2 text-zinc-800">
                          {reviewRating} of 5 Stars
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-zinc-700 block">Net Promoter Score (0 - 10)</label>
                      <div className="flex items-center gap-1 overflow-x-auto pb-1">
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((nps) => (
                          <button
                            key={nps}
                            type="button"
                            onClick={() => setReviewNps(nps)}
                            className={`w-6 h-6 rounded text-[11px] font-mono font-bold transition cursor-pointer ${
                              reviewNps === nps
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                            }`}
                          >
                            {nps}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-700 block">Traveler Feedback / Testimonial</label>
                    <textarea
                      rows={2}
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="e.g. Loved the Kamandalu villa! Recommended our agency to friends for honeymoon trips."
                      className="w-full border border-zinc-200 rounded p-2 text-xs focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-700">
                      <input
                        type="checkbox"
                        checked={reviewRepeat}
                        onChange={(e) => setReviewRepeat(e.target.checked)}
                        className="rounded border-zinc-300"
                      />
                      <span>Tag as High-Value Repeat Customer for annual campaigns</span>
                    </label>

                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-medium shadow-2xs cursor-pointer"
                    >
                      Save Post-Trip Review
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <QuickLogModal
        lead={lead}
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
      />
      <WhatsAppModal
        lead={lead}
        isOpen={isWaModalOpen}
        onClose={() => setIsWaModalOpen(false)}
      />
      <WinDealModal
        lead={lead}
        isOpen={isWinModalOpen}
        onClose={() => setIsWinModalOpen(false)}
      />
      <LostDealModal
        lead={lead}
        isOpen={isLostModalOpen}
        onClose={() => setIsLostModalOpen(false)}
      />
      <QuoteBuilderModal
        lead={lead}
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
      />
      <PaymentReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        payment={selectedPaymentForReceipt}
        lead={lead}
      />
      <ItineraryDayModal
        isOpen={isItineraryModalOpen}
        onClose={() => setIsItineraryModalOpen(false)}
        onSave={handleSaveItineraryDay}
        dayToEdit={dayToEdit}
        suggestedDayNumber={(lead.itinerary_days?.length || 0) + 1}
      />
    </div>
  );
}

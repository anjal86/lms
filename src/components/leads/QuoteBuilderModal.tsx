'use client';

import React, { useState } from 'react';
import { Lead, QuoteLineItem } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import {
  X,
  Plus,
  Trash2,
  FileText,
  MessageSquare,
  Printer,
  Check,
  Plane,
  Building,
  Car,
  Compass,
  Shield,
  FileCheck,
  DollarSign,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface QuoteBuilderModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
}

export default function QuoteBuilderModal({ lead, isOpen, onClose }: QuoteBuilderModalProps) {
  const { createLeadQuotation, formatCurrency, agencySettings, getAgentIncentiveProfile, currentUser, showToast } = useApp();
  useDialog(isOpen, onClose);

  const [packageTitle, setPackageTitle] = useState(
    lead.latest_quote?.package_title || `${lead.destination} ${lead.duration_days}D/${Math.max(1, lead.duration_days - 1)}N ${lead.travel_type ? lead.travel_type.toUpperCase() : 'Custom'} Getaway`
  );
  const [durationDays, setDurationDays] = useState(lead.duration_days || 5);
  const [validityDays, setValidityDays] = useState(7);
  const [hotelCategory, setHotelCategory] = useState(lead.hotel_category || '4-star');
  const [copiedWa, setCopiedWa] = useState(false);
  const [showVoucherPreview, setShowVoucherPreview] = useState(false);

  // Initial line items
  const defaultLineItems: QuoteLineItem[] = [
    {
      id: 'item-1',
      category: 'flight',
      description: `Roundtrip Airfare to ${lead.destination} (${lead.pax_adults} Pax)`,
      supplier_cost: 950,
      client_price: 1100,
    },
    {
      id: 'item-2',
      category: 'hotel',
      description: `${hotelCategory.toUpperCase()} Accommodation (${Math.max(1, durationDays - 1)} Nights w/ Breakfast)`,
      supplier_cost: 1100,
      client_price: 1350,
    },
    {
      id: 'item-3',
      category: 'transfer',
      description: 'Private Airport Transfers & Chauffeur Services',
      supplier_cost: 150,
      client_price: 200,
    },
    {
      id: 'item-4',
      category: 'sightseeing',
      description: 'Guided Island Excursion & Entrance Permits',
      supplier_cost: 200,
      client_price: 280,
    },
  ];

  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(
    lead.latest_quote?.line_items && lead.latest_quote.line_items.length > 0
      ? lead.latest_quote.line_items
      : defaultLineItems
  );

  const [inclusions, setInclusions] = useState<string>(
    'Daily Buffet Breakfast, Airport Meet & Greet, Private AC Transfers, 24/7 Concierge Support, All Applicable Hotel Taxes.'
  );
  const [exclusions, setExclusions] = useState<string>(
    'Personal Expenses, Travel Insurance, Optional Activity Tips, Tourism Visa Fees on Arrival.'
  );

  if (!isOpen) return null;

  // Real-time calculations
  const totalSupplierCost = lineItems.reduce((sum, item) => sum + (Number(item.supplier_cost) || 0), 0);
  const totalSellingPrice = lineItems.reduce((sum, item) => sum + (Number(item.client_price) || 0), 0);
  const grossProfit = Math.max(0, totalSellingPrice - totalSupplierCost);
  const profitMarginPct = totalSellingPrice > 0 ? Math.round((grossProfit / totalSellingPrice) * 1000) / 10 : 0;

  // Consultant commission rate
  const agentProfile = getAgentIncentiveProfile(lead.assigned_to || currentUser.id);
  const commRate = agentProfile.currentTier.commission_pct_profit || 9;
  const commissionEarned = Math.round(grossProfit * (commRate / 100) * 100) / 100;
  const minMarginGate = agencySettings.min_gross_margin_threshold || 10;
  const isMarginWarning = profitMarginPct < minMarginGate;

  const handleAddLineItem = () => {
    const newItem: QuoteLineItem = {
      id: `item-${Date.now()}`,
      category: 'other',
      description: 'Custom Service / Tour Add-on',
      supplier_cost: 100,
      client_price: 150,
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleUpdateLineItem = (id: string, field: keyof QuoteLineItem, value: any) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: field === 'supplier_cost' || field === 'client_price' ? Number(value) : value,
        };
      })
    );
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const generateWhatsAppQuoteText = () => {
    return `🌟 *${packageTitle}*
👤 *Traveler:* ${lead.customer_name} (${lead.pax_adults} Adults${lead.pax_children ? `, ${lead.pax_children} Children` : ''})
📍 *Destination:* ${lead.destination} (${durationDays} Days / ${Math.max(1, durationDays - 1)} Nights)
🗓️ *Travel Window:* ${lead.travel_dates || 'Flexible 2026'}

📋 *Package Highlights & Inclusions:*
${lineItems.map((item) => `• ${item.description}`).join('\n')}

✅ *Included:* ${inclusions}
❌ *Excluded:* ${exclusions}

💰 *All-Inclusive Package Price:* ${formatCurrency(totalSellingPrice)}
⏳ *Validity:* Quotation valid for ${validityDays} days.

Reply to this message or call to customize hotels, add flights, or confirm your booking!`;
  };

  const handleCopyWhatsApp = () => {
    const text = generateWhatsAppQuoteText();
    navigator.clipboard.writeText(text);
    setCopiedWa(true);
    showToast('Copied WhatsApp quotation summary to clipboard', 'success');
    setTimeout(() => setCopiedWa(false), 2500);
  };

  const handleSaveAndDispatch = (e: React.FormEvent) => {
    e.preventDefault();

    createLeadQuotation(lead.id, {
      package_title: packageTitle,
      destination: lead.destination,
      duration_days: Number(durationDays),
      travel_dates: lead.travel_dates,
      pax_summary: `${lead.pax_adults} Adults${lead.pax_children ? `, ${lead.pax_children} Children` : ''}`,
      hotel_category: hotelCategory,
      line_items: lineItems,
      total_selling_price: totalSellingPrice,
      total_supplier_cost: totalSupplierCost,
      gross_profit: grossProfit,
      profit_margin_pct: profitMarginPct,
      commission_earned: commissionEarned,
      inclusions: inclusions.split(',').map((s) => s.trim()).filter(Boolean),
      exclusions: exclusions.split(',').map((s) => s.trim()).filter(Boolean),
      validity_days: Number(validityDays),
      status: 'sent',
    });

    showToast('Quotation generated and marked dispatched', 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-zinc-950/60 backdrop-blur-xs"
    >
      <div
        className="bg-white rounded-lg border border-zinc-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70 rounded-t-lg">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-zinc-900 text-zinc-50 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="quote-modal-title" className="font-semibold text-zinc-900 text-sm tracking-tight">
                  Travel Quotation & Itinerary Proposal
                </h2>
                <span className="font-mono text-[10px] text-zinc-500 bg-zinc-200/60 px-1.5 py-0.2 rounded">
                  {lead.lead_code}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                {lead.customer_name} • {lead.destination} • {lead.pax_adults} Adults
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close quotation modal"
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/50 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Package Overview Form */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50/50 p-3 rounded-lg border border-zinc-200">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Package Itinerary Title
              </label>
              <input
                type="text"
                value={packageTitle}
                onChange={(e) => setPackageTitle(e.target.value)}
                className="w-full border border-zinc-200 rounded-md p-1.5 bg-white text-zinc-900 font-medium focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Hotel Tier Standard
              </label>
              <select
                value={hotelCategory}
                onChange={(e) => setHotelCategory(e.target.value)}
                className="w-full border border-zinc-200 rounded-md p-1.5 bg-white text-zinc-800 focus:outline-none"
              >
                <option value="3-star">3-Star Comfort</option>
                <option value="4-star">4-Star Premium</option>
                <option value="5-star">5-Star Luxury</option>
                <option value="boutique villa">Private Boutique Villa</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full border border-zinc-200 rounded-md p-1.5 bg-white text-zinc-900 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Quote Validity
              </label>
              <select
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
                className="w-full border border-zinc-200 rounded-md p-1.5 bg-white text-zinc-800 focus:outline-none"
              >
                <option value="3">3 Days (Urgent)</option>
                <option value="7">7 Days (Standard)</option>
                <option value="14">14 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Travel Window
              </label>
              <div className="font-mono text-zinc-700 p-1.5 bg-zinc-100 rounded border border-zinc-200 truncate">
                {lead.travel_dates || 'Flexible 2026'}
              </div>
            </div>
          </div>

          {/* Itemized Cost Breakdown Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-800 text-[11px] uppercase tracking-tight">
                Itemized Service & Supplier Cost Breakdown
              </span>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-900 hover:text-black bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded transition"
              >
                <Plus className="w-3 h-3" /> Add Service Line
              </button>
            </div>

            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase tracking-tight text-[10px] font-medium">
                    <th className="py-2 px-3 w-28">Category</th>
                    <th className="py-2 px-3">Service Description</th>
                    <th className="py-2 px-3 w-28 text-right font-mono">Net Cost</th>
                    <th className="py-2 px-3 w-28 text-right font-mono">Sale Price</th>
                    <th className="py-2 px-2 w-8 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-sans">
                  {lineItems.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-1.5 px-3">
                        <select
                          value={item.category}
                          aria-label="Line item category"
                          onChange={(e) => handleUpdateLineItem(item.id, 'category', e.target.value)}
                          className="w-full text-[11px] border border-zinc-200 rounded p-1 bg-white capitalize text-zinc-700"
                        >
                          <option value="flight">Flight</option>
                          <option value="hotel">Hotel</option>
                          <option value="transfer">Transfer</option>
                          <option value="sightseeing">Activity</option>
                          <option value="insurance">Insurance</option>
                          <option value="visa">Visa</option>
                          <option value="markup">Service Fee</option>
                          <option value="other">Other</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-3">
                        <input
                          type="text"
                          value={item.description}
                          aria-label="Line item description"
                          onChange={(e) => handleUpdateLineItem(item.id, 'description', e.target.value)}
                          className="w-full text-xs border border-zinc-200 rounded p-1 bg-white text-zinc-800"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-zinc-400 font-mono text-[10px]">{agencySettings.currency_symbol}</span>
                          <input
                            type="number"
                            min="0"
                            value={item.supplier_cost}
                            aria-label="Supplier cost"
                            onChange={(e) => handleUpdateLineItem(item.id, 'supplier_cost', e.target.value)}
                            className="w-20 text-right font-mono text-xs border border-zinc-200 rounded p-1 bg-white text-zinc-700"
                          />
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-zinc-400 font-mono text-[10px]">{agencySettings.currency_symbol}</span>
                          <input
                            type="number"
                            min="0"
                            value={item.client_price}
                            aria-label="Client price"
                            onChange={(e) => handleUpdateLineItem(item.id, 'client_price', e.target.value)}
                            className="w-20 text-right font-mono font-medium text-xs border border-zinc-200 rounded p-1 bg-white text-zinc-900"
                          />
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(item.id)}
                          disabled={lineItems.length <= 1}
                          aria-label="Delete line item"
                          className="text-zinc-400 hover:text-red-600 disabled:opacity-30 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real-Time Financials & Margin Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-900 text-zinc-100 p-3 rounded-lg font-mono">
            <div>
              <div className="text-[10px] text-zinc-400 uppercase font-sans tracking-tight">Total Client Price</div>
              <div className="text-base font-bold text-white mt-0.5">{formatCurrency(totalSellingPrice)}</div>
            </div>
            <div className="border-l border-zinc-800 pl-3">
              <div className="text-[10px] text-zinc-400 uppercase font-sans tracking-tight">Net Supplier Cost</div>
              <div className="text-base font-medium text-zinc-400 mt-0.5">{formatCurrency(totalSupplierCost)}</div>
            </div>
            <div className="border-l border-zinc-800 pl-3">
              <div className="text-[10px] text-zinc-400 uppercase font-sans tracking-tight">Gross Profit (Margin)</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5 flex items-center gap-1.5">
                <span>{formatCurrency(grossProfit)}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-sans ${isMarginWarning ? 'bg-amber-900 text-amber-200' : 'bg-emerald-900 text-emerald-200'}`}>
                  {profitMarginPct}%
                </span>
              </div>
            </div>
            <div className="border-l border-zinc-800 pl-3">
              <div className="text-[10px] text-zinc-400 uppercase font-sans tracking-tight">Consultant Comm. ({commRate}%)</div>
              <div className="text-base font-bold text-amber-400 mt-0.5">{formatCurrency(commissionEarned)}</div>
            </div>
          </div>

          {isMarginWarning && (
            <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2 text-[11px]">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Margin Alert:</strong> This quotation margin ({profitMarginPct}%) is below the agency target threshold ({minMarginGate}%).
              </span>
            </div>
          )}

          {/* Inclusions & Exclusions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Included Services
              </label>
              <textarea
                rows={2}
                value={inclusions}
                onChange={(e) => setInclusions(e.target.value)}
                className="w-full border border-zinc-200 rounded-md p-2 bg-zinc-50 text-zinc-800 focus:bg-white focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Excluded Services
              </label>
              <textarea
                rows={2}
                value={exclusions}
                onChange={(e) => setExclusions(e.target.value)}
                className="w-full border border-zinc-200 rounded-md p-2 bg-zinc-50 text-zinc-800 focus:bg-white focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Printable Voucher Preview Toggle */}
          {showVoucherPreview && (
            <div className="border border-zinc-200 rounded-lg p-4 bg-white space-y-3 font-sans shadow-sm">
              <div className="border-b border-zinc-200 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 tracking-tight">WANDERLUST TRAVEL EXPEDITIONS</h3>
                  <p className="text-[11px] text-zinc-500 font-mono">Official Quotation & Proposal Voucher • Ref: QT-{lead.lead_code}</p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-zinc-900">{formatCurrency(totalSellingPrice)}</div>
                  <div className="text-[10px] text-zinc-400">Valid: {validityDays} Days</div>
                </div>
              </div>

              <div className="text-xs space-y-1 text-zinc-700">
                <p><strong>Traveler:</strong> {lead.customer_name} ({lead.pax_adults} Adults)</p>
                <p><strong>Destination:</strong> {lead.destination} ({durationDays} Days / {Math.max(1, durationDays - 1)} Nights)</p>
                <p><strong>Package:</strong> {packageTitle}</p>
              </div>

              <div className="pt-2">
                <h4 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight mb-1">Itinerary Breakdown</h4>
                <ul className="list-disc pl-4 space-y-0.5 text-zinc-700 text-[11px]">
                  {lineItems.map((item) => (
                    <li key={item.id}>{item.description}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 text-[10px] text-zinc-500 border-t border-zinc-100 flex justify-between">
                <span>Issued by: {currentUser.full_name}</span>
                <span>Travel LMS Automated Engine</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-zinc-200 bg-zinc-50/70 rounded-b-lg flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-md font-medium text-xs shadow-2xs transition"
            >
              {copiedWa ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />}
              <span>{copiedWa ? 'Copied WhatsApp Proposal!' : 'Copy WhatsApp Quote'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowVoucherPreview(!showVoucherPreview)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-md font-medium text-xs transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{showVoucherPreview ? 'Hide Voucher' : 'Preview Voucher'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-zinc-200 hover:bg-zinc-100 text-zinc-700 rounded-md text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndDispatch}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-black text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Dispatch & Move to Quote Sent</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

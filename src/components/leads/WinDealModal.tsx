'use client';

import React, { useState } from 'react';
import { Lead } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { X, Check, DollarSign, Percent, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

interface WinDealModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
}

export default function WinDealModal({ lead, isOpen, onClose }: WinDealModalProps) {
  const { updateLeadStage, getAgentIncentiveProfile, showToast } = useApp();
  useDialog(isOpen, onClose);

  const initialSale = lead.package_sale_price || lead.won_deal_value || 3200;
  const initialCost = lead.vendor_net_cost || Math.round(initialSale * 0.78);

  const [salePrice, setSalePrice] = useState<number>(initialSale);
  const [vendorCost, setVendorCost] = useState<number>(initialCost);

  if (!isOpen) return null;

  const agentProfile = getAgentIncentiveProfile(lead.assigned_to || '');
  const activeTier = agentProfile.currentTier;

  // Real-time calculations
  const grossProfit = Math.max(0, salePrice - vendorCost);
  const marginPct = salePrice > 0 ? Math.round((grossProfit / salePrice) * 1000) / 10 : 0;
  const meetsMarginGate = marginPct >= activeTier.min_margin_threshold;
  const effectiveRate = meetsMarginGate
    ? activeTier.commission_pct_profit
    : activeTier.commission_pct_profit * 0.5;
  const commission = Math.round(grossProfit * (effectiveRate / 100) * 100) / 100;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    updateLeadStage(lead.id, 'won', undefined, undefined, {
      packageSalePrice: Number(salePrice),
      vendorNetCost: Number(vendorCost),
    });

    showToast(`Deal won for ${lead.customer_name}! Commission: $${commission.toLocaleString()}`, 'success');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-deal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in duration-100"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50/50">
          <div>
            <div id="win-deal-title" className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
              <span>Won Deal & Margin Settlement</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                Won (Closed)
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {lead.customer_name} • {lead.destination} ({lead.lead_code})
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-4 space-y-3.5 text-xs">
          {/* Inputs */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Final Package Sale Price ($)
              </label>
              <div className="relative">
                <DollarSign className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min="1"
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(Number(e.target.value))}
                  className="w-full pl-6 pr-2 py-1.5 font-mono text-xs font-semibold border border-zinc-200 rounded bg-white text-zinc-900 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-zinc-400 mt-0.5 block">What traveler paid</span>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-tight mb-1">
                Supplier / Net Cost ($)
              </label>
              <div className="relative">
                <DollarSign className="w-3 h-3 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min="0"
                  required
                  value={vendorCost}
                  onChange={(e) => setVendorCost(Number(e.target.value))}
                  className="w-full pl-6 pr-2 py-1.5 font-mono text-xs font-semibold border border-zinc-200 rounded bg-white text-zinc-900 focus:outline-none"
                />
              </div>
              <span className="text-[10px] text-zinc-400 mt-0.5 block">Flights + hotel + DMC</span>
            </div>
          </div>

          {/* Live Profit & Incentive Computation Panel */}
          <div className="bg-zinc-50 p-3 rounded border border-zinc-200 space-y-2">
            <div className="text-[10px] uppercase font-semibold text-zinc-400 tracking-tight flex items-center justify-between">
              <span>Financial Breakdown</span>
              <span className="font-mono text-zinc-600">{activeTier.name} ({activeTier.commission_pct_profit}% rate)</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-zinc-200/60 font-mono">
              <div className="bg-white p-2 rounded border border-zinc-200/80">
                <div className="text-[10px] text-zinc-400 font-sans">Gross Profit</div>
                <div className="text-sm font-bold text-zinc-900 mt-0.5">${grossProfit.toLocaleString()}</div>
              </div>

              <div className="bg-white p-2 rounded border border-zinc-200/80">
                <div className="text-[10px] text-zinc-400 font-sans">Profit Margin</div>
                <div className={`text-sm font-bold mt-0.5 ${marginPct >= 10 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {marginPct}%
                </div>
              </div>

              <div className="bg-white p-2 rounded border border-zinc-200/80">
                <div className="text-[10px] text-zinc-400 font-sans">Commission</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">${commission.toFixed(2)}</div>
              </div>
            </div>

            {!meetsMarginGate && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Margin Protection Warning:</strong> Deal margin ({marginPct}%) is below the {activeTier.min_margin_threshold}% minimum threshold. Commission scaled to {effectiveRate}%.
                </span>
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1 text-xs font-medium text-white bg-zinc-900 hover:bg-black rounded shadow-2xs transition"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm & Accrue Incentive</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

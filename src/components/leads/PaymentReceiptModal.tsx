'use client';

import React from 'react';
import { PaymentRecord, Lead } from '@/lib/types';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { Printer, X, ShieldCheck } from 'lucide-react';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentRecord | null;
  lead: Lead;
}

export default function PaymentReceiptModal({
  isOpen,
  onClose,
  payment,
  lead,
}: PaymentReceiptModalProps) {
  const { formatCurrency, formatAppDate, currentUser } = useApp();
  useDialog(isOpen, onClose);

  if (!isOpen || !payment) return null;

  const totalPaid = (lead.payment_records || []).reduce((sum, r) => sum + r.amount, 0);
  const totalPackagePrice = (lead.package_sale_price || lead.won_deal_value) || 0;
  const balanceRemaining = Math.max(0, totalPackagePrice - totalPaid);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payment Receipt Preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-2xs p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-lg border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Action Bar (hidden in print) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-zinc-50 print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-zinc-900">
              Official Payment Voucher / Receipt
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print receipt"
              className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-medium transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="text-zinc-400 hover:text-zinc-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-zinc-900 bg-white" id="printable-receipt">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-zinc-200 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base text-zinc-950">
                  Wanderlust Travel CRM
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Payment Confirmed
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Licensed Tour Operator & Luxury Destination Services
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-400 uppercase font-mono block">Receipt No.</span>
              <span className="font-mono font-bold text-xs text-zinc-900">{payment.receipt_number}</span>
              <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
                {formatAppDate(payment.received_at)}
              </span>
            </div>
          </div>

          {/* Customer & Trip Summary Grid */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block font-sans">
                Received From:
              </span>
              <span className="font-medium text-zinc-900 block">{lead.customer_name}</span>
              <span className="text-zinc-500 font-mono text-[11px] block">{lead.customer_phone}</span>
              {lead.customer_email && (
                <span className="text-zinc-500 font-mono text-[11px] block">{lead.customer_email}</span>
              )}
            </div>

            <div className="space-y-1 text-right">
              <span className="text-[10px] uppercase font-semibold text-zinc-400 block font-sans">
                Itinerary & Booking Ref:
              </span>
              <span className="font-medium text-zinc-900 block">{lead.destination} ({lead.duration_days} Days)</span>
              <span className="text-zinc-500 font-mono text-[11px] block">Lead Ref: {lead.lead_code}</span>
              <span className="text-zinc-500 text-[11px] block capitalize">Style: {lead.travel_type}</span>
            </div>
          </div>

          {/* Payment Amount Card */}
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">
                  Amount Received
                </span>
                <span className="text-2xl font-bold font-mono text-zinc-950">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">
                  Payment Method
                </span>
                <span className="text-xs font-semibold capitalize font-mono text-zinc-800">
                  {payment.method.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-zinc-400">Transaction Ref:</span>{' '}
                <span className="font-mono font-medium text-zinc-800">
                  {payment.reference_no || 'Direct / Bank Record'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-zinc-400">Handled By:</span>{' '}
                <span className="font-medium text-zinc-800">{currentUser.full_name}</span>
              </div>
            </div>

            {payment.notes && (
              <div className="pt-2 border-t border-zinc-200 text-[11px] text-zinc-600 italic">
                "{payment.notes}"
              </div>
            )}
          </div>

          {/* Account Balance Summary */}
          <div className="space-y-1.5 text-xs pt-1 border-t border-zinc-200">
            <div className="flex justify-between text-zinc-600">
              <span>Total Package Cost:</span>
              <span className="font-mono font-medium">{formatCurrency(totalPackagePrice)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Cumulative Payments Received:</span>
              <span className="font-mono font-bold">-{formatCurrency(totalPaid)}</span>
            </div>
            <div className="flex justify-between font-bold text-zinc-900 border-t border-zinc-200 pt-1.5">
              <span>Outstanding Balance Remaining:</span>
              <span className="font-mono text-zinc-950">
                {balanceRemaining === 0 ? 'PAID IN FULL ✓' : formatCurrency(balanceRemaining)}
              </span>
            </div>
          </div>

          {/* Footer Terms */}
          <div className="pt-3 border-t border-zinc-100 text-[10px] text-zinc-400 text-center space-y-0.5">
            <p>Thank you for choosing Wanderlust Travel CRM. Electronic voucher generated by authorized travel consultant.</p>
            <p className="font-mono">Security Token: {payment.id} • Verified Authentic</p>
          </div>
        </div>
      </div>
    </div>
  );
}

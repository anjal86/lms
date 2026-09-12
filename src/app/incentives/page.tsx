'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { IncentiveTier, CommissionStatus } from '@/lib/types';
import {
  Trophy,
  DollarSign,
  TrendingUp,
  Award,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Sliders,
  Check,
  AlertCircle,
  Users,
  Download,
} from 'lucide-react';
import { exportToCsv } from '@/lib/export-csv';

export default function IncentivesPage() {
  useEffect(() => {
    document.title = 'Incentives & Commission Ledger — Wanderlust CRM';
  }, []);

  const {
    currentUser,
    allProfiles,
    allLeads,
    incentiveTiers,
    updateIncentiveTiers,
    approveCommissionPayout,
    getAgentIncentiveProfile,
    agencySettings,
    formatCurrency,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'my_incentives' | 'team_ledger' | 'tier_rules'>('my_incentives');
  const [selectedAgentId, setSelectedAgentId] = useState(
    currentUser.role === 'agent' ? currentUser.id : allProfiles.find((p) => p.role === 'agent')?.id || currentUser.id
  );

  const [editingTiers, setEditingTiers] = useState<IncentiveTier[]>(incentiveTiers);
  const [isSavedTiers, setIsSavedTiers] = useState(false);

  const selectedAgent = allProfiles.find((p) => p.id === selectedAgentId) || currentUser;
  const agentProfile = getAgentIncentiveProfile(selectedAgent.id);

  const tdsPct = agencySettings.commission_tds_pct ?? 10;
  const approvedTotal = agentProfile.approvedCommission;
  const tdsAmount = Math.round(approvedTotal * (tdsPct / 100) * 100) / 100;
  const netDisbursable = Math.max(0, Math.round((approvedTotal - tdsAmount) * 100) / 100);

  // Agency-wide aggregates for Manager/Admin
  const allWonLeads = allLeads.filter((l) => l.stage === 'won');
  const agencyTotalRevenue = allWonLeads.reduce((sum, l) => sum + (l.package_sale_price || l.won_deal_value || 0), 0);
  const agencyVendorCosts = allWonLeads.reduce((sum, l) => sum + (l.vendor_net_cost || 0), 0);
  const agencyGrossProfit = allWonLeads.reduce((sum, l) => sum + (l.gross_profit || 0), 0);
  const agencyMarginPct = agencyTotalRevenue > 0 ? Math.round((agencyGrossProfit / agencyTotalRevenue) * 1000) / 10 : 0;
  const totalCommissionsAccrued = allWonLeads.reduce((sum, l) => sum + (l.agent_commission_earned || 0), 0);

  const handleExportLedgerCsv = () => {
    exportToCsv(
      `deals_profit_ledger_${new Date().toISOString().slice(0, 10)}`,
      allWonLeads,
      [
        { header: 'Deal Code', accessor: (l) => l.lead_code },
        { header: 'Traveler Name', accessor: (l) => l.customer_name },
        { header: 'Destination', accessor: (l) => l.destination },
        {
          header: 'Consultant',
          accessor: (l) => {
            const ag = allProfiles.find((p) => p.id === l.assigned_to);
            return ag ? ag.full_name : 'Unassigned';
          },
        },
        { header: 'Package Sale Price', accessor: (l) => l.package_sale_price || l.won_deal_value || 0 },
        { header: 'Net Supplier Cost', accessor: (l) => l.vendor_net_cost || 0 },
        { header: 'Gross Profit', accessor: (l) => l.gross_profit || 0 },
        { header: 'Margin %', accessor: (l) => l.profit_margin_pct || 0 },
        { header: 'Commission Earned', accessor: (l) => l.agent_commission_earned || 0 },
        { header: 'Commission Status', accessor: (l) => l.commission_status || 'accrued' },
        { header: 'Closed At', accessor: (l) => l.closed_at || l.updated_at },
      ]
    );
  };

  const handleSaveTiers = (e: React.FormEvent) => {
    e.preventDefault();
    updateIncentiveTiers(editingTiers);
    setIsSavedTiers(true);
    setTimeout(() => setIsSavedTiers(false), 2000);
  };

  const handleTierChange = (index: number, field: keyof IncentiveTier, value: any) => {
    const updated = [...editingTiers];
    updated[index] = { ...updated[index], [field]: value };
    setEditingTiers(updated);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto text-xs">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Incentives & Profit Tracker
          </h1>
          <p className="text-xs text-zinc-500">
            Sales threshold tiers, deal profit margins, and consultant commission management
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-zinc-200 shadow-2xs">
          <button
            onClick={() => setActiveTab('my_incentives')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              activeTab === 'my_incentives' ? 'bg-zinc-900 text-zinc-50 shadow-2xs' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {currentUser.role === 'agent' ? 'My Incentives' : 'Agent Performance'}
          </button>
          <button
            onClick={() => setActiveTab('team_ledger')}
            className={`px-3 py-1.5 rounded-md font-medium transition ${
              activeTab === 'team_ledger' ? 'bg-zinc-900 text-zinc-50 shadow-2xs' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            Deals Profit Ledger
          </button>
          {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
            <button
              onClick={() => setActiveTab('tier_rules')}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                activeTab === 'tier_rules' ? 'bg-zinc-900 text-zinc-50 shadow-2xs' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              Threshold Rules
            </button>
          )}
        </div>
      </div>

      {activeTab === 'my_incentives' && (
        <div className="space-y-4">
          {/* Agent Picker for Manager */}
          {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
            <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-zinc-200 shadow-2xs">
              <span className="font-medium text-zinc-700">Inspecting Consultant Incentive Record:</span>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="font-medium text-zinc-900 border border-zinc-200 rounded px-2.5 py-1 bg-zinc-50"
              >
                {allProfiles
                  .filter((p) => p.role === 'agent')
                  .map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.full_name} ({ag.destination_tags.slice(0, 2).join(', ')})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Tier Threshold Ladder Tracker */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tight">
                  Monthly Milestone Progress
                </span>
                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  {agentProfile.currentTier.name} ({agentProfile.currentTier.commission_pct_profit}% rate)
                </span>
              </div>
              <div className="font-mono text-zinc-700">
                <strong>{formatCurrency(agentProfile.totalSales)}</strong> monthly sales
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden border border-zinc-200">
              <div
                className="bg-zinc-900 h-full rounded-full transition-all duration-500"
                style={{ width: `${agentProfile.progressPct}%` }}
              />
            </div>

            {/* Tiers indicator strip */}
            <div className="grid grid-cols-4 gap-2 pt-2 text-center font-mono text-[11px]">
              {incentiveTiers.map((tier) => {
                const isCurrent = agentProfile.currentTier.id === tier.id;
                const isPassed = agentProfile.totalSales >= (tier.max_sales || tier.min_sales);

                return (
                  <div
                    key={tier.id}
                    className={`p-2 rounded border text-left ${
                      isCurrent
                        ? 'bg-zinc-900 text-zinc-50 border-zinc-900 shadow-2xs'
                        : isPassed
                        ? 'bg-zinc-50 text-zinc-700 border-zinc-200'
                        : 'bg-white text-zinc-400 border-zinc-200'
                    }`}
                  >
                    <div className="font-sans font-semibold text-xs flex items-center justify-between">
                      <span>{tier.name}</span>
                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </div>
                    <div className="mt-1 font-mono text-[10px]">
                      {tier.commission_pct_profit}% profit comm.
                    </div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {agencySettings.currency_symbol}{(tier.min_sales / 1000).toFixed(0)}k {tier.max_sales ? `- ${agencySettings.currency_symbol}${(tier.max_sales / 1000).toFixed(0)}k` : '+'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Next Tier Incentive Gap */}
            {agentProfile.nextTier ? (
              <div className="p-2.5 rounded bg-zinc-50 border border-zinc-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span>
                    Close <strong className="font-mono text-zinc-900">{formatCurrency(agentProfile.salesToNextTier)}</strong> more in sales to reach <strong>{agentProfile.nextTier.name}</strong> and increase your commission rate to <strong>{agentProfile.nextTier.commission_pct_profit}%</strong>!
                  </span>
                </div>
                {agentProfile.nextTier.milestone_bonus > 0 && (
                  <span className="font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex-shrink-0">
                    +{formatCurrency(agentProfile.nextTier.milestone_bonus)} Bonus
                  </span>
                )}
              </div>
            ) : (
              <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Top tier unlocked! Earning top-rate 18% commission on gross profit.</span>
              </div>
            )}
          </div>

          {/* Earnings Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Closed Revenue</div>
              <div className="text-lg font-mono font-medium text-zinc-900 mt-0.5">
                {formatCurrency(agentProfile.totalSales)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{agentProfile.wonDealsCount} won bookings</div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Gross Profit Delivered</div>
              <div className="text-lg font-mono font-medium text-zinc-900 mt-0.5">
                {formatCurrency(agentProfile.totalGrossProfit)}
              </div>
              <div className="text-[10px] font-mono text-emerald-700 mt-0.5">{agentProfile.avgProfitMargin}% avg margin</div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Accrued Commission</div>
              <div className="text-lg font-mono font-medium text-amber-700 mt-0.5">
                {formatCurrency(agentProfile.accruedCommission)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Awaiting payout approval</div>
            </div>

            <div className="bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-tight">Approved / Paid</div>
              <div className="text-lg font-mono font-medium text-emerald-700 mt-0.5">
                {formatCurrency(agentProfile.approvedCommission + agentProfile.paidCommission)}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Settled incentives</div>
            </div>
          </div>

          {/* Net Disbursable Payout & Tax Breakdown (Anti-Slop / Linear-Grade) */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-white border border-zinc-200 text-zinc-700 shadow-2xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 flex items-center gap-2">
                  Net Disbursable Payout: <span className="font-mono text-sm text-emerald-700 font-bold">{formatCurrency(netDisbursable)}</span>
                </div>
                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                  <span>Gross Approved: <strong className="font-mono text-zinc-700">{formatCurrency(approvedTotal)}</strong></span>
                  <span>•</span>
                  <span>Withholding Tax (TDS {tdsPct}%): <strong className="font-mono text-amber-700">-{formatCurrency(tdsAmount)}</strong></span>
                  <span>•</span>
                  <span className="capitalize">{agencySettings.payout_frequency} cycle</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-zinc-200/70 text-zinc-700 font-mono">
                Currency: {agencySettings.currency} ({agencySettings.currency_symbol})
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'team_ledger' && (
        <div className="space-y-4">
          {/* Agency Gross Profit Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-lg border border-zinc-200 shadow-2xs font-mono">
            <div>
              <div className="text-[10px] font-medium text-zinc-500 uppercase font-sans">Total Agency Sales</div>
              <div className="text-lg font-bold text-zinc-900 mt-0.5">{formatCurrency(agencyTotalRevenue)}</div>
            </div>
            <div className="border-l border-zinc-100 pl-3">
              <div className="text-[10px] font-medium text-zinc-500 uppercase font-sans">Vendor Outflows</div>
              <div className="text-lg font-bold text-zinc-600 mt-0.5">{formatCurrency(agencyVendorCosts)}</div>
            </div>
            <div className="border-l border-zinc-100 pl-3">
              <div className="text-[10px] font-medium text-zinc-500 uppercase font-sans">Net Gross Profit</div>
              <div className="text-lg font-bold text-emerald-700 mt-0.5">
                {formatCurrency(agencyGrossProfit)} <span className="text-xs text-zinc-500">({agencyMarginPct}%)</span>
              </div>
            </div>
            <div className="border-l border-zinc-100 pl-3">
              <div className="text-[10px] font-medium text-zinc-500 uppercase font-sans">Total Commissions</div>
              <div className="text-lg font-bold text-zinc-900 mt-0.5">{formatCurrency(totalCommissionsAccrued)}</div>
            </div>
          </div>

          {/* Deals Ledger Table */}
          <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="px-3 py-2 border-b border-zinc-200/80 bg-zinc-50/50 flex items-center justify-between">
              <span className="font-semibold text-zinc-800 text-[11px] uppercase tracking-tight">
                Won Deals Profit & Commission Ledger
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-zinc-400 text-[11px]">{allWonLeads.length} won packages</span>
                <button
                  onClick={handleExportLedgerCsv}
                  title="Export accounting ledger to CSV"
                  aria-label="Export ledger to CSV"
                  className="flex items-center gap-1 px-2 py-0.5 border border-zinc-200 rounded text-[11px] font-medium text-zinc-700 bg-white hover:bg-zinc-50 shadow-2xs transition"
                >
                  <Download className="w-3 h-3 text-zinc-500" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-200 text-zinc-500 uppercase tracking-tight text-[10px] font-medium">
                  <th className="py-2 px-3 font-mono">Code</th>
                  <th className="py-2 px-3">Traveler & Destination</th>
                  <th className="py-2 px-3">Consultant</th>
                  <th className="py-2 px-3 text-right font-mono">Sale Price</th>
                  <th className="py-2 px-3 text-right font-mono">Supplier Cost</th>
                  <th className="py-2 px-3 text-right font-mono">Gross Profit</th>
                  <th className="py-2 px-3 text-center font-mono">Margin %</th>
                  <th className="py-2 px-3 text-right font-mono">Commission</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
                    <th className="py-2 px-3 text-right">Approval</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-sans">
                {allWonLeads.map((lead) => {
                  const agent = allProfiles.find((p) => p.id === lead.assigned_to);
                  const sale = lead.package_sale_price || lead.won_deal_value || 0;
                  const cost = lead.vendor_net_cost || Math.round(sale * 0.8);
                  const profit = lead.gross_profit || Math.max(0, sale - cost);
                  const margin = lead.profit_margin_pct || (sale > 0 ? Math.round((profit / sale) * 1000) / 10 : 20);
                  const comm = lead.agent_commission_earned || Math.round(profit * 0.09 * 100) / 100;
                  const status: CommissionStatus = lead.commission_status || 'accrued';

                  return (
                    <tr key={lead.id} className="hover:bg-zinc-50/80 transition">
                      <td className="py-2 px-3 font-mono text-[11px] text-zinc-500">
                        {lead.lead_code}
                      </td>
                      <td className="py-2 px-3">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-zinc-900 hover:underline">
                          {lead.customer_name}
                        </Link>
                        <div className="text-[10px] text-zinc-500">{lead.destination}</div>
                      </td>
                      <td className="py-2 px-3 text-zinc-700">
                        {agent ? agent.full_name.split(' ')[0] : 'Unassigned'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-zinc-900">
                        {formatCurrency(sale)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-zinc-500">
                        {formatCurrency(cost)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium text-zinc-900">
                        {formatCurrency(profit)}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${margin >= 10 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                          {margin}%
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatCurrency(comm)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded uppercase font-medium ${
                            status === 'paid'
                              ? 'bg-zinc-100 text-zinc-800'
                              : status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
                        <td className="py-2 px-3 text-right">
                          {status === 'accrued' ? (
                            <button
                              onClick={() => approveCommissionPayout(lead.id, 'approved')}
                              className="px-2 py-0.5 bg-zinc-900 hover:bg-black text-white rounded text-[10px] font-medium shadow-2xs"
                            >
                              Approve
                            </button>
                          ) : status === 'approved' ? (
                            <button
                              onClick={() => approveCommissionPayout(lead.id, 'paid')}
                              className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-medium shadow-2xs"
                            >
                              Mark Paid
                            </button>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-mono">settled</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'tier_rules' && (
        <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-zinc-500" />
                Incentive Tiers & Margin Gate Configuration
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Configure monthly sales thresholds, profit commission rates, and margin gate rules
              </p>
            </div>
            {isSavedTiers && (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ✓ Saved Rules
              </span>
            )}
          </div>

          <form onSubmit={handleSaveTiers} className="space-y-3">
            <div className="space-y-2">
              {editingTiers.map((tier, idx) => (
                <div
                  key={tier.id}
                  className="p-3 bg-zinc-50 rounded border border-zinc-200 grid grid-cols-1 sm:grid-cols-5 gap-2 items-center text-xs"
                >
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Tier Name</span>
                    <input
                      type="text"
                      value={tier.name}
                      onChange={(e) => handleTierChange(idx, 'name', e.target.value)}
                      className="font-semibold text-zinc-900 border border-zinc-200 rounded p-1 bg-white w-full"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Sales Range ($)</span>
                    <div className="flex items-center gap-1 font-mono">
                      <input
                        type="number"
                        value={tier.min_sales}
                        onChange={(e) => handleTierChange(idx, 'min_sales', Number(e.target.value))}
                        className="w-16 border border-zinc-200 rounded p-1 bg-white"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        value={tier.max_sales || 999999}
                        onChange={(e) => handleTierChange(idx, 'max_sales', Number(e.target.value))}
                        className="w-16 border border-zinc-200 rounded p-1 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Commission (% on Profit)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={tier.commission_pct_profit}
                      onChange={(e) => handleTierChange(idx, 'commission_pct_profit', Number(e.target.value))}
                      className="w-20 border border-zinc-200 rounded p-1 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Cash Bonus ($)</span>
                    <input
                      type="number"
                      value={tier.milestone_bonus}
                      onChange={(e) => handleTierChange(idx, 'milestone_bonus', Number(e.target.value))}
                      className="w-20 border border-zinc-200 rounded p-1 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Min Margin (%)</span>
                    <input
                      type="number"
                      value={tier.min_margin_threshold}
                      onChange={(e) => handleTierChange(idx, 'min_margin_threshold', Number(e.target.value))}
                      className="w-20 border border-zinc-200 rounded p-1 bg-white font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2.5 rounded bg-zinc-100/70 border border-zinc-200 text-zinc-600 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Margin Protection Policy:</strong> When a closed deal's profit margin falls below the tier's minimum margin threshold, the commission rate is automatically reduced by 50% to prevent excessive discounting.
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-4 py-1.5 bg-zinc-900 hover:bg-black text-white rounded text-xs font-medium shadow-2xs"
              >
                Save Incentive Thresholds
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

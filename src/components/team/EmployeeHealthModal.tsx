'use client';

import React, { useState } from 'react';
import { useApp } from '@/lib/store';
import { useDialog } from '@/lib/useDialog';
import { Profile, EmployeeHealthScore } from '@/lib/types';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  TrendingUp,
  Users,
  X,
  RefreshCw,
  Zap,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface EmployeeHealthModalProps {
  member: Profile | null;
  isOpen: boolean;
  onClose: () => void;
  onRebalanceSuccess?: () => void;
}

export default function EmployeeHealthModal({
  member,
  isOpen,
  onClose,
  onRebalanceSuccess,
}: EmployeeHealthModalProps) {
  useDialog({ isOpen, onClose });

  const { getAgentHealthScore, rebalanceOverdueFollowUps, currentUser } = useApp();
  const [rebalanceFeedback, setRebalanceFeedback] = useState<string | null>(null);

  if (!isOpen || !member) return null;

  const health: EmployeeHealthScore = getAgentHealthScore(member.id);

  const getGradeInfo = (grade: EmployeeHealthScore['grade']) => {
    switch (grade) {
      case 'elite':
        return {
          label: 'Elite Performer',
          desc: 'High velocity, rapid response times, and healthy pipeline capacity',
          dotColor: 'bg-emerald-500',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'healthy':
        return {
          label: 'Healthy & Steady',
          desc: 'Consistent on-time callbacks and balanced lead distribution',
          dotColor: 'bg-blue-500',
          badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
        };
      case 'attention_needed':
        return {
          label: 'Needs Attention',
          desc: 'Accumulating overdue callbacks or aging quotes; slight SLA delay',
          dotColor: 'bg-amber-500',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'burnout_risk':
        return {
          label: 'High Burnout / SLA Risk',
          desc: 'Workload at/near peak capacity with multiple overdue client tasks',
          dotColor: 'bg-red-500',
          badgeClass: 'bg-red-50 text-red-800 border-red-200',
        };
    }
  };

  const gradeInfo = getGradeInfo(health.grade);

  const handleRebalance = () => {
    const count = rebalanceOverdueFollowUps(member.id);
    if (count > 0) {
      setRebalanceFeedback(`Reassigned ${count} overdue tasks to available agents.`);
      if (onRebalanceSuccess) onRebalanceSuccess();
    } else {
      setRebalanceFeedback('No overdue callbacks to reassign.');
    }
    setTimeout(() => setRebalanceFeedback(null), 4000);
  };

  const canManage = currentUser.role === 'admin' || currentUser.role === 'manager';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="health-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg border border-zinc-200 shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center gap-2.5">
            <img
              src={member.avatar_url}
              alt={member.full_name}
              className="w-8 h-8 rounded-full object-cover border border-zinc-200"
            />
            <div>
              <h2 id="health-modal-title" className="text-sm font-semibold text-zinc-900 tracking-tight">
                {member.full_name} — Health & Accountability Index
              </h2>
              <p className="text-[11px] text-zinc-500 font-mono">
                {member.employee_code || 'CONSULTANT'} • {member.destination_tags.slice(0, 2).join(', ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close health modal"
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition min-h-[28px] min-w-[28px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Overall Health Score Card */}
          <div className="p-3.5 bg-zinc-50/80 rounded-lg border border-zinc-200 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-semibold ${gradeInfo.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${gradeInfo.dotColor}`} />
                  <span>{gradeInfo.label}</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Score Index</span>
              </div>
              <p className="text-xs text-zinc-600 leading-tight pr-2">{gradeInfo.desc}</p>
            </div>

            <div className="text-right shrink-0">
              <div className="text-3xl font-mono font-bold tracking-tight text-zinc-900">
                {health.overall_score}
                <span className="text-xs text-zinc-400 font-sans font-normal"> / 100</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-tight">Performance Rating</span>
            </div>
          </div>

          {/* 4-Pillar Metric Breakdown Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* 1. SLA Speed */}
            <div className="p-2.5 rounded-md border border-zinc-200 bg-white space-y-1">
              <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  SLA Response
                </span>
                <span className="font-mono font-semibold text-zinc-800">{health.sla_score}/100</span>
              </div>
              <div className="text-sm font-mono font-medium text-zinc-900">
                {health.avg_frt_minutes}m <span className="text-[10px] text-zinc-400 font-sans">avg FRT</span>
              </div>
              <div className="text-[10px] text-zinc-500">Target: &lt;15 mins per lead</div>
            </div>

            {/* 2. Follow-Up Discipline */}
            <div className="p-2.5 rounded-md border border-zinc-200 bg-white space-y-1">
              <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-zinc-400" />
                  Follow-Up Discipline
                </span>
                <span className="font-mono font-semibold text-zinc-800">{health.followup_score}/100</span>
              </div>
              <div className="text-sm font-mono font-medium text-zinc-900">
                {health.on_time_followup_pct}% <span className="text-[10px] text-zinc-400 font-sans">on-time</span>
              </div>
              <div className="text-[10px] text-zinc-500">
                {health.overdue_tasks_count > 0 ? (
                  <span className="text-red-600 font-medium">{health.overdue_tasks_count} overdue calls</span>
                ) : (
                  <span className="text-emerald-700">0 overdue calls</span>
                )}
              </div>
            </div>

            {/* 3. Conversion Velocity */}
            <div className="p-2.5 rounded-md border border-zinc-200 bg-white space-y-1">
              <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-zinc-400" />
                  Sales Conversion
                </span>
                <span className="font-mono font-semibold text-zinc-800">{health.conversion_score}/100</span>
              </div>
              <div className="text-sm font-mono font-medium text-zinc-900">
                {health.active_leads_count} <span className="text-[10px] text-zinc-400 font-sans">active deals</span>
              </div>
              <div className="text-[10px] text-zinc-500">Fast quote-to-close ratio</div>
            </div>

            {/* 4. Capacity Stress Balance */}
            <div className="p-2.5 rounded-md border border-zinc-200 bg-white space-y-1">
              <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-zinc-400" />
                  Workload Stress
                </span>
                <span className="font-mono font-semibold text-zinc-800">{health.workload_score}/100</span>
              </div>
              <div className="text-sm font-mono font-medium text-zinc-900">
                {health.capacity_pct}% <span className="text-[10px] text-zinc-400 font-sans">utilized</span>
              </div>
              <div className="text-[10px] text-zinc-500">
                {member.current_load} / {member.max_capacity} max inquiries
              </div>
            </div>
          </div>

          {/* Smart Recommendations */}
          <div className="p-3 bg-zinc-50 rounded-md border border-zinc-200 space-y-2 text-xs">
            <span className="font-semibold text-zinc-900 flex items-center gap-1.5 text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
              Automated Operational Recommendations
            </span>
            <ul className="space-y-1.5 text-[11px] text-zinc-600 pl-4 list-disc">
              {health.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>

          {rebalanceFeedback && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{rebalanceFeedback}</span>
            </div>
          )}

          {/* Rebalance Action */}
          {canManage && health.overdue_tasks_count > 0 && (
            <div className="p-3 bg-red-50/60 rounded-md border border-red-200/80 flex items-center justify-between gap-2 text-xs">
              <div className="text-red-900">
                <span className="font-semibold block text-[11px]">Relieve Overdue Bottleneck</span>
                <span className="text-[10px] text-red-700">Rebalance {health.overdue_tasks_count} overdue inquiries to available team members</span>
              </div>
              <button
                type="button"
                onClick={handleRebalance}
                className="px-2.5 py-1.5 rounded-md bg-red-800 hover:bg-red-900 text-white font-medium text-xs shadow-2xs transition flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rebalance Now</span>
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>Last Activity: {health.last_active_at ? 'Active today' : 'No recorded activity'}</span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-sans font-medium text-xs transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

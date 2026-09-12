'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { FollowUp, Lead, FollowUpChannel } from '@/lib/types';
import QuickLogModal from '@/components/leads/QuickLogModal';
import WhatsAppModal from '@/components/leads/WhatsAppModal';
import ScheduleFollowUpModal from '@/components/followups/ScheduleFollowUpModal';
import FollowUpDispositionModal from '@/components/followups/FollowUpDispositionModal';
import {
  CalendarClock,
  Phone,
  MessageSquare,
  Mail,
  Check,
  MapPin,
  Clock,
  CheckCircle2,
  Plus,
  Download,
  LayoutGrid,
  List,
  AlertTriangle,
  RefreshCw,
  Search,
  Sun,
  Sunset,
  Sunrise,
  SlidersHorizontal,
} from 'lucide-react';

export default function FollowUpsPage() {
  useEffect(() => {
    document.title = 'Follow-Up Agenda & SLA — Wanderlust CRM';
  }, []);

  const {
    followUps,
    allLeads,
    allProfiles,
    currentUser,
    completeFollowUp,
    createFollowUp,
    rebalanceOverdueFollowUps,
    exportFollowUpsIcal,
    formatAppDate,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'overdue' | 'today' | 'upcoming' | 'completed'>('today');
  const [selectedChannel, setSelectedChannel] = useState<'all' | FollowUpChannel>('all');
  const [viewMode, setViewMode] = useState<'agenda' | 'timeblocks'>('agenda');

  const [activeLogLead, setActiveLogLead] = useState<Lead | null>(null);
  const [activeWaLead, setActiveWaLead] = useState<Lead | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [activeDispositionTask, setActiveDispositionTask] = useState<FollowUp | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('ALL');
  const [rebalanceFeedback, setRebalanceFeedback] = useState<string | null>(null);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedChannel('all');
    setSelectedAgent('ALL');
    setActiveTab('today');
  };

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const visibleTasks = followUps.filter((fu) => {
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    return fu.assigned_to === currentUser.id;
  });

  const overdueTasks = visibleTasks.filter((fu) => {
    return fu.status !== 'completed' && new Date(fu.scheduled_at).getTime() < now;
  });

  const todayTasks = visibleTasks.filter((fu) => {
    const time = new Date(fu.scheduled_at).getTime();
    return fu.status !== 'completed' && time >= startOfToday.getTime() && time <= endOfToday.getTime();
  });

  const upcomingTasks = visibleTasks.filter((fu) => {
    const time = new Date(fu.scheduled_at).getTime();
    return fu.status !== 'completed' && time > endOfToday.getTime();
  });

  const completedTasks = visibleTasks.filter((fu) => fu.status === 'completed');

  // Critical Overdue (>24 hours) for Escalation Radar
  const criticalOverdueTasks = overdueTasks.filter(
    (fu) => now - new Date(fu.scheduled_at).getTime() > 24 * 3600000
  );

  const currentTabList =
    activeTab === 'overdue'
      ? overdueTasks
      : activeTab === 'today'
      ? todayTasks
      : activeTab === 'upcoming'
      ? upcomingTasks
      : completedTasks;

  const displayedList = currentTabList.filter((fu) => {
    if (selectedChannel !== 'all' && fu.channel !== selectedChannel) return false;
    return true;
  });

  const handleAutoRebalance = () => {
    const count = rebalanceOverdueFollowUps(currentUser.id);
    if (count > 0) {
      setRebalanceFeedback(`Successfully rebalanced ${count} overdue inquiries to available agents with capacity.`);
    } else {
      setRebalanceFeedback('All current follow-ups are within healthy thresholds.');
    }
    setTimeout(() => setRebalanceFeedback(null), 5000);
  };

  const handleQuickReschedule = (fu: FollowUp, days: number) => {
    const nextDate = new Date(Date.now() + days * 86400000).toISOString();
    createFollowUp({
      lead_id: fu.lead_id,
      assigned_to: fu.assigned_to,
      title: fu.title,
      scheduled_at: nextDate,
      channel: fu.channel,
      notes: fu.notes,
    });
    completeFollowUp(fu.id, `Rescheduled by ${days} days`);
  };

  // Grouping for Time-Blocked View
  const timeBlocks = {
    morning: displayedList.filter((fu) => {
      const hour = new Date(fu.scheduled_at).getHours();
      return hour < 12;
    }),
    afternoon: displayedList.filter((fu) => {
      const hour = new Date(fu.scheduled_at).getHours();
      return hour >= 12 && hour < 16;
    }),
    evening: displayedList.filter((fu) => {
      const hour = new Date(fu.scheduled_at).getHours();
      return hour >= 16;
    }),
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto text-xs">
      {/* Title & Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-zinc-200 shadow-2xs">
        <div>
          <h1 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-zinc-500" />
            <span>Follow-Up Agenda & Cadence Engine</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Structured client callbacks, call dispositions, automated retries, and calendar sync
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export iCal */}
          <button
            type="button"
            onClick={() => exportFollowUpsIcal(displayedList)}
            aria-label="Export agenda to iCalendar"
            title="Download iCal (.ics) file for Google Calendar or Outlook"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-md text-zinc-700 font-medium transition"
          >
            <Download className="w-3.5 h-3.5 text-zinc-500" />
            <span>Export .ics</span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex bg-zinc-100 p-0.5 rounded-md border border-zinc-200">
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              aria-label="Switch to Table / List view"
              className={`p-1.5 rounded transition ${
                viewMode === 'agenda' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Table Agenda"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeblocks')}
              aria-label="Switch to Time-Blocked Grid view"
              className={`p-1.5 rounded transition ${
                viewMode === 'timeblocks' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
              }`}
              title="Time-Blocked Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsScheduleModalOpen(true)}
            aria-label="Schedule new task"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md font-medium shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Task</span>
          </button>
        </div>
      </div>

      {/* Overdue Escalation Radar Banner (Linear-style warning) */}
      {criticalOverdueTasks.length > 0 && (
        <div className="p-3 bg-red-50/80 border border-red-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-red-950">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-xs flex items-center gap-2">
                <span>Overdue Escalation Radar</span>
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-red-200 text-red-800 font-bold">
                  {criticalOverdueTasks.length} CRITICAL (&gt;24h)
                </span>
              </div>
              <p className="text-[11px] text-red-800 mt-0.5">
                These callbacks are severely past due. Rebalancing to active agents prevents lead cold-off and recovers SLA metrics.
              </p>
            </div>
          </div>

          {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
            <button
              type="button"
              onClick={handleAutoRebalance}
              className="px-3 py-1.5 rounded-md bg-red-900 hover:bg-red-950 text-white font-medium text-xs shadow-2xs transition shrink-0 self-start sm:self-auto flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto-Rebalance Leads</span>
            </button>
          )}
        </div>
      )}

      {rebalanceFeedback && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{rebalanceFeedback}</span>
        </div>
      )}

      {/* Segmented Filter Bar & Channel Pills */}
      <div className="bg-white p-2 rounded-lg border border-zinc-200 shadow-2xs space-y-2">
        {/* Status Tabs */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-1">
            {[
              { id: 'overdue', label: 'Overdue', count: overdueTasks.length, alert: overdueTasks.length > 0 },
              { id: 'today', label: 'Due Today', count: todayTasks.length },
              { id: 'upcoming', label: 'Upcoming', count: upcomingTasks.length },
              { id: 'completed', label: 'Completed', count: completedTasks.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-zinc-900 text-zinc-50 shadow-2xs'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  suppressHydrationWarning
                  className={`font-mono text-[10px] px-1 py-0.2 rounded ${
                    activeTab === tab.id
                      ? 'bg-zinc-800 text-zinc-200'
                      : tab.alert
                      ? 'bg-red-100 text-red-700 font-bold'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Channel Filters */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-zinc-400 text-[10px] uppercase font-mono mr-1">Channel:</span>
            {(['all', 'call', 'whatsapp', 'email', 'meeting'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setSelectedChannel(ch)}
                className={`px-2 py-0.5 rounded text-[11px] transition capitalize ${
                  selectedChannel === ch
                    ? 'bg-zinc-200 text-zinc-900 font-medium'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                }`}
              >
                {ch === 'all' ? 'All' : ch}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area: Agenda vs Time-Blocked */}
      {viewMode === 'agenda' ? (
        /* Agenda Table / List View */
        <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="divide-y divide-zinc-100">
            {displayedList.length === 0 ? (
              <div className="p-10 text-center text-zinc-400 flex flex-col items-center justify-center space-y-2">
                <Search className="w-5 h-5 text-zinc-300 stroke-[1.5]" />
                <div className="text-xs font-semibold text-zinc-700">No follow-up tasks match this view</div>
                <p className="text-[11px] text-zinc-400 max-w-xs">
                  Try adjusting your channel, tab, or agent filter, or reset everything to view today's tasks.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-1 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition shadow-2xs"
                >
                  Clear all filters & view today
                </button>
              </div>
            ) : (
              displayedList.map((fu) => {
                const lead = allLeads.find((l) => l.id === fu.lead_id);
                const isPast = new Date(fu.scheduled_at).getTime() < now;
                const retryCount = fu.retry_count || 0;

                return (
                  <div
                    key={fu.id}
                    className="p-3 flex items-center justify-between gap-4 hover:bg-zinc-50/70 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 border ${
                          fu.channel === 'call'
                            ? 'bg-zinc-100 border-zinc-200 text-zinc-700'
                            : fu.channel === 'whatsapp'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-zinc-100 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        {fu.channel === 'call' ? (
                          <Phone className="w-3.5 h-3.5" />
                        ) : fu.channel === 'whatsapp' ? (
                          <MessageSquare className="w-3.5 h-3.5" />
                        ) : (
                          <Mail className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900 truncate">{fu.title}</span>
                          {isPast && fu.status !== 'completed' && (
                            <span className="text-[10px] font-mono px-1 py-0.2 rounded border border-red-200 bg-red-50 text-red-700 font-medium">
                              OVERDUE
                            </span>
                          )}
                          {retryCount > 0 && (
                            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                              Retry #{retryCount}
                            </span>
                          )}
                        </div>

                        {lead && (
                          <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                            <Link href={`/leads/${lead.id}`} className="hover:text-zinc-900 font-medium">
                              {lead.customer_name} ({lead.lead_code})
                            </Link>
                            <span>•</span>
                            <span>{lead.destination}</span>
                            <span>•</span>
                            <span className="font-mono text-zinc-600">{lead.customer_phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span suppressHydrationWarning className="text-[11px] font-mono text-zinc-400 mr-2">
                        {new Date(fu.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {lead && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveWaLead(lead)}
                            aria-label={`Send WhatsApp to ${lead.customer_name}`}
                            title="WhatsApp"
                            className="p-1 rounded text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 transition min-h-[28px] min-w-[28px] inline-flex items-center justify-center"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveLogLead(lead)}
                            aria-label={`Call ${lead.customer_name}`}
                            title="Call"
                            className="p-1 rounded text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition min-h-[28px] min-w-[28px] inline-flex items-center justify-center"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {fu.status !== 'completed' ? (
                        <>
                          {/* Log Disposition Trigger */}
                          <button
                            type="button"
                            onClick={() => setActiveDispositionTask(fu)}
                            aria-label={`Log disposition for ${lead?.customer_name || 'task'}`}
                            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-900 hover:bg-black text-white rounded text-xs font-medium shadow-2xs transition"
                          >
                            <Check className="w-3 h-3" />
                            <span>Disposition</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleQuickReschedule(fu, 1)}
                            aria-label={`Reschedule follow-up for ${lead ? lead.customer_name : 'task'} by +1 day`}
                            className="px-1.5 py-1 text-[10px] font-mono text-zinc-600 border border-zinc-200 rounded hover:bg-zinc-100 transition"
                          >
                            +1d
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> done
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Time-Blocked Grid View (Morning, Afternoon, Evening) */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Morning Block */}
          <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-100 bg-amber-50/40 flex items-center justify-between">
              <span className="font-semibold text-zinc-900 flex items-center gap-1.5">
                <Sunrise className="w-3.5 h-3.5 text-amber-600" />
                Morning (09:00 - 12:00)
              </span>
              <span className="font-mono text-[10px] text-zinc-500 bg-white px-1.5 py-0.2 rounded border border-zinc-200">
                {timeBlocks.morning.length}
              </span>
            </div>
            <div className="p-2.5 space-y-2 flex-1 overflow-y-auto max-h-[500px]">
              {timeBlocks.morning.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 font-mono text-[11px]">No morning tasks</div>
              ) : (
                timeBlocks.morning.map((fu) => {
                  const lead = allLeads.find((l) => l.id === fu.lead_id);
                  return (
                    <div
                      key={fu.id}
                      onClick={() => setActiveDispositionTask(fu)}
                      className="p-2.5 rounded-md border border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-white transition cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-900 truncate">{lead?.customer_name || 'Traveler'}</span>
                        <span suppressHydrationWarning className="text-[10px] font-mono text-zinc-500">
                          {new Date(fu.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-600 line-clamp-1">{fu.title}</div>
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-[10px] text-zinc-400 font-mono">
                        <span>{lead?.destination}</span>
                        <span className="text-zinc-700 capitalize">● {fu.channel}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Afternoon Block */}
          <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-100 bg-blue-50/40 flex items-center justify-between">
              <span className="font-semibold text-zinc-900 flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-blue-600" />
                Afternoon (12:00 - 16:00)
              </span>
              <span className="font-mono text-[10px] text-zinc-500 bg-white px-1.5 py-0.2 rounded border border-zinc-200">
                {timeBlocks.afternoon.length}
              </span>
            </div>
            <div className="p-2.5 space-y-2 flex-1 overflow-y-auto max-h-[500px]">
              {timeBlocks.afternoon.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 font-mono text-[11px]">No afternoon tasks</div>
              ) : (
                timeBlocks.afternoon.map((fu) => {
                  const lead = allLeads.find((l) => l.id === fu.lead_id);
                  return (
                    <div
                      key={fu.id}
                      onClick={() => setActiveDispositionTask(fu)}
                      className="p-2.5 rounded-md border border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-white transition cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-900 truncate">{lead?.customer_name || 'Traveler'}</span>
                        <span suppressHydrationWarning className="text-[10px] font-mono text-zinc-500">
                          {new Date(fu.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-600 line-clamp-1">{fu.title}</div>
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-[10px] text-zinc-400 font-mono">
                        <span>{lead?.destination}</span>
                        <span className="text-zinc-700 capitalize">● {fu.channel}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Evening Block */}
          <div className="bg-white rounded-lg border border-zinc-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-100 bg-indigo-50/40 flex items-center justify-between">
              <span className="font-semibold text-zinc-900 flex items-center gap-1.5">
                <Sunset className="w-3.5 h-3.5 text-indigo-600" />
                Evening (16:00 - 19:00+)
              </span>
              <span className="font-mono text-[10px] text-zinc-500 bg-white px-1.5 py-0.2 rounded border border-zinc-200">
                {timeBlocks.evening.length}
              </span>
            </div>
            <div className="p-2.5 space-y-2 flex-1 overflow-y-auto max-h-[500px]">
              {timeBlocks.evening.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 font-mono text-[11px]">No evening tasks</div>
              ) : (
                timeBlocks.evening.map((fu) => {
                  const lead = allLeads.find((l) => l.id === fu.lead_id);
                  return (
                    <div
                      key={fu.id}
                      onClick={() => setActiveDispositionTask(fu)}
                      className="p-2.5 rounded-md border border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-white transition cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-900 truncate">{lead?.customer_name || 'Traveler'}</span>
                        <span suppressHydrationWarning className="text-[10px] font-mono text-zinc-500">
                          {new Date(fu.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-600 line-clamp-1">{fu.title}</div>
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-[10px] text-zinc-400 font-mono">
                        <span>{lead?.destination}</span>
                        <span className="text-zinc-700 capitalize">● {fu.channel}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {activeDispositionTask && (
        <FollowUpDispositionModal
          followUp={activeDispositionTask}
          lead={allLeads.find((l) => l.id === activeDispositionTask.lead_id)}
          isOpen={!!activeDispositionTask}
          onClose={() => setActiveDispositionTask(null)}
        />
      )}

      {activeLogLead && (
        <QuickLogModal
          lead={activeLogLead}
          isOpen={!!activeLogLead}
          onClose={() => setActiveLogLead(null)}
        />
      )}

      {activeWaLead && (
        <WhatsAppModal
          lead={activeWaLead}
          isOpen={!!activeWaLead}
          onClose={() => setActiveWaLead(null)}
        />
      )}

      {isScheduleModalOpen && (
        <ScheduleFollowUpModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
        />
      )}
    </div>
  );
}

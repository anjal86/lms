'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/store';
import { canAccessSettings, canAccessSettingsTab } from '@/lib/permissions';
import {
  CurrencyCode,
  DateFormat,
  RoutingStrategy,
  RoutingOverflowPolicy,
  SoundPreset,
} from '@/lib/types';
import {
  Settings,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Users,
  Webhook,
  Clock,
  Check,
  Copy,
  Plus,
  Volume2,
  Sliders,
  Globe,
  DollarSign,
  Calendar,
  Shuffle,
  Tag,
  Trash2,
  CalendarDays,
  BellRing,
  Database,
  Download,
  Upload,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  FileJson,
} from 'lucide-react';

type SettingsTab = 'sla' | 'routing' | 'financials' | 'audio' | 'taxonomies' | 'integrations' | 'storage';

export default function SettingsPage() {
  useEffect(() => {
    document.title = 'Settings · Operations & Configuration — Wanderlust CRM';
  }, []);

  const {
    currentUser,
    agencySettings,
    updateAgencySettings,
    allProfiles,
    playNotificationSound,
    formatCurrency,
    allLeads,
    followUps,
    activities,
    notifications,
    isHydrated,
    resetToFactoryDefaults,
    exportCrmBackup,
    importCrmBackup,
  } = useApp();

  const [activeTab, setActiveTab] = useState<SettingsTab>('sla');
  const [savedSection, setSavedSection] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const restoreFileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as SettingsTab;
      if (
        tabParam &&
        ['sla', 'routing', 'financials', 'audio', 'taxonomies', 'integrations', 'storage'].includes(tabParam)
      ) {
        setActiveTab(tabParam);
      }
    }
  }, []);

  // Tab 1: SLA & Business Hours
  const [frtMinutes, setFrtMinutes] = useState(agencySettings.frt_minutes);
  const [preBreachWarningMinutes, setPreBreachWarningMinutes] = useState(
    agencySettings.pre_breach_warning_minutes || 15
  );
  const [businessHoursStart, setBusinessHoursStart] = useState(
    agencySettings.business_hours_start || '09:00'
  );
  const [businessHoursEnd, setBusinessHoursEnd] = useState(
    agencySettings.business_hours_end || '18:00'
  );
  const [freezeSlaWeekends, setFreezeSlaWeekends] = useState(
    agencySettings.freeze_sla_weekends ?? true
  );
  const [timezone, setTimezone] = useState(agencySettings.timezone || 'America/New_York (EST)');
  const [escalateToManager, setEscalateToManager] = useState(agencySettings.escalate_to_manager);
  const [autoReassign, setAutoReassign] = useState(agencySettings.auto_reassign_breached_leads);
  const [reassignHours, setReassignHours] = useState(agencySettings.auto_reassign_hours);

  // Tab 2: Routing Engine
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy>(
    agencySettings.routing_strategy || 'workload_balanced'
  );
  const [overflowPolicy, setOverflowPolicy] = useState<RoutingOverflowPolicy>(
    agencySettings.routing_overflow_policy || 'unassigned_pool'
  );
  const [vipThreshold, setVipThreshold] = useState(
    agencySettings.vip_high_budget_threshold || 8000
  );
  const [vipSeniorsOnly, setVipSeniorsOnly] = useState(
    agencySettings.vip_route_seniors_only ?? true
  );
  const [leadCooldown, setLeadCooldown] = useState(agencySettings.lead_cooldown_minutes || 3);

  // Tab 3: Currency & Financials
  const [currency, setCurrency] = useState<CurrencyCode>(agencySettings.currency || 'USD');
  const [dateFormat, setDateFormat] = useState<DateFormat>(agencySettings.date_format || 'DD/MM/YYYY');
  const [minMargin, setMinMargin] = useState(agencySettings.min_gross_margin_threshold || 12);
  const [tdsPct, setTdsPct] = useState(agencySettings.commission_tds_pct || 10);

  // Tab 4: Audio & Notifications
  const [soundEnabled, setSoundEnabled] = useState(agencySettings.notification_sound_enabled ?? true);
  const [soundPreset, setSoundPreset] = useState<SoundPreset>(
    agencySettings.notification_sound_preset || 'chime'
  );
  const [volume, setVolume] = useState(agencySettings.notification_volume ?? 75);
  const [muteInCall, setMuteInCall] = useState(agencySettings.mute_sound_in_call ?? true);
  const [browserPush, setBrowserPush] = useState(agencySettings.browser_push_enabled ?? false);
  const [toastDuration, setToastDuration] = useState(agencySettings.toast_duration_seconds || 3);

  // Tab 5: Taxonomies
  const [lostReasons, setLostReasons] = useState<string[]>(
    agencySettings.custom_lost_reasons || []
  );
  const [newReasonInput, setNewReasonInput] = useState('');
  const [leadSources, setLeadSources] = useState<string[]>(
    agencySettings.custom_lead_sources || []
  );
  const [newSourceInput, setNewSourceInput] = useState('');
  const [autoArchiveDays, setAutoArchiveDays] = useState(agencySettings.auto_archive_days || 30);

  // Tab 6: Ingestion
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const triggerSaveNotification = (sectionName: string) => {
    setSavedSection(sectionName);
    setTimeout(() => setSavedSection(null), 2000);
  };

  const handleSaveSla = (e: React.FormEvent) => {
    e.preventDefault();
    updateAgencySettings({
      frt_minutes: Number(frtMinutes),
      pre_breach_warning_minutes: Number(preBreachWarningMinutes),
      business_hours_start: businessHoursStart,
      business_hours_end: businessHoursEnd,
      freeze_sla_weekends: freezeSlaWeekends,
      timezone,
      escalate_to_manager: escalateToManager,
      auto_reassign_breached_leads: autoReassign,
      auto_reassign_hours: Number(reassignHours),
    });
    triggerSaveNotification('SLA & Business Hours');
  };

  const handleSaveRouting = (e: React.FormEvent) => {
    e.preventDefault();
    updateAgencySettings({
      routing_strategy: routingStrategy,
      routing_overflow_policy: overflowPolicy,
      vip_high_budget_threshold: Number(vipThreshold),
      vip_route_seniors_only: vipSeniorsOnly,
      lead_cooldown_minutes: Number(leadCooldown),
    });
    triggerSaveNotification('Routing Strategy');
  };

  const handleSaveFinancials = (e: React.FormEvent) => {
    e.preventDefault();
    updateAgencySettings({
      currency,
      date_format: dateFormat,
      min_gross_margin_threshold: Number(minMargin),
      commission_tds_pct: Number(tdsPct),
    });
    triggerSaveNotification('Currency & Regional');
  };

  const handleSaveAudio = (e: React.FormEvent) => {
    e.preventDefault();
    updateAgencySettings({
      notification_sound_enabled: soundEnabled,
      notification_sound_preset: soundPreset,
      notification_volume: Number(volume),
      mute_sound_in_call: muteInCall,
      browser_push_enabled: browserPush,
      toast_duration_seconds: Number(toastDuration),
    });
    triggerSaveNotification('Audio & Notifications');
  };

  const handleAddReason = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReasonInput.trim()) return;
    const updated = Array.from(new Set([...lostReasons, newReasonInput.trim()]));
    setLostReasons(updated);
    updateAgencySettings({ custom_lost_reasons: updated });
    setNewReasonInput('');
  };

  const handleDeleteReason = (reason: string) => {
    const updated = lostReasons.filter((r) => r !== reason);
    setLostReasons(updated);
    updateAgencySettings({ custom_lost_reasons: updated });
  };

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceInput.trim()) return;
    const clean = newSourceInput.trim().toLowerCase().replace(/\s+/g, '_');
    const updated = Array.from(new Set([...leadSources, clean]));
    setLeadSources(updated);
    updateAgencySettings({ custom_lead_sources: updated });
    setNewSourceInput('');
  };

  const handleDeleteSource = (source: string) => {
    const updated = leadSources.filter((s) => s !== source);
    setLeadSources(updated);
    updateAgencySettings({ custom_lead_sources: updated });
  };

  const sampleWebhookPayload = `{
  "customer_name": "Rohan Sharma",
  "customer_phone": "+919876543210",
  "customer_email": "rohan.sharma@gmail.com",
  "destination": "Bali",
  "budget_range": "$2,000 - $3,000",
  "travel_dates": "Nov 10-17, 2026",
  "pax_adults": 2,
  "travel_type": "honeymoon",
  "special_notes": "Private pool villa request",
  "source": "meta_ads"
}`;

  const copyWebhookCode = () => {
    const curlCommand = `curl -X POST http://localhost:3000/api/leads/webhook \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_WEBHOOK_SECRET>" \\
  -d '${sampleWebhookPayload.replace(/\n/g, '')}'`;
    navigator.clipboard.writeText(curlCommand);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 1500);
  };

  const handleExportBackup = () => {
    exportCrmBackup();
    setBackupStatus({ type: 'success', message: 'Full CRM JSON snapshot downloaded.' });
    triggerSaveNotification('Backup Exported');
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        setBackupStatus({ type: 'error', message: 'Backup file is empty.' });
        return;
      }
      const success = importCrmBackup(content);
      if (success) {
        setBackupStatus({ type: 'success', message: 'CRM data restored successfully from snapshot!' });
        triggerSaveNotification('Data Restored');
      } else {
        setBackupStatus({ type: 'error', message: 'Invalid backup file. Ensure it contains a valid JSON snapshot structure.' });
      }
    };
    reader.onerror = () => {
      setBackupStatus({ type: 'error', message: 'Error reading selected file.' });
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleResetDefaults = () => {
    resetToFactoryDefaults();
    setShowResetConfirm(false);
    setBackupStatus({ type: 'success', message: 'CRM restored to pristine initial demo dataset.' });
    triggerSaveNotification('Factory Defaults Restored');
  };

  const tabs: { id: SettingsTab; label: string; icon: any; lock?: string }[] = [
    { id: 'sla', label: 'SLA & Shifts', icon: ShieldAlert },
    { id: 'routing', label: 'Routing Engine', icon: Shuffle },
    {
      id: 'financials',
      label: 'Currency & Payouts',
      icon: DollarSign,
      lock: currentUser.role !== 'admin' ? 'Locked' : undefined,
    },
    { id: 'audio', label: 'Audio & Alerts', icon: Volume2 },
    { id: 'taxonomies', label: 'Taxonomies', icon: Tag },
    { id: 'integrations', label: 'Webhook & Roster', icon: Webhook },
    {
      id: 'storage',
      label: 'Data & Backup',
      icon: Database,
      lock: currentUser.role !== 'admin' ? 'Admin' : undefined,
    },
  ];

  // RBAC: Frontline Agents are forbidden from accessing Agency Settings
  if (!canAccessSettings(currentUser.role)) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center animate-in fade-in duration-150">
        <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 flex items-center justify-center mx-auto mb-4 shadow-sm">
          <ShieldAlert className="w-6 h-6 text-red-400" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono uppercase bg-red-50 text-red-700 border border-red-200 mb-2">
          <span>403 Forbidden • Access Restricted</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 mb-2">
          Agency Settings Require Manager Clearance
        </h1>
        <p className="text-xs text-zinc-500 leading-relaxed max-w-md mx-auto mb-6">
          Frontline destination consultants cannot modify company-wide SLA timers, routing algorithms, gross margin gates, or database backups. Please contact your sales manager or agency administrator for configuration changes.
        </p>

        <div className="bg-white border border-zinc-200 rounded-lg p-3.5 mb-6 text-left text-xs max-w-md mx-auto shadow-xs">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold mb-2">
            Active Consultant Credentials
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src={currentUser.avatar_url}
                alt={currentUser.full_name}
                className="w-8 h-8 rounded-full object-cover border border-zinc-200"
              />
              <div>
                <div className="font-semibold text-zinc-900">{currentUser.full_name}</div>
                <div className="text-[11px] text-zinc-500 font-mono">{currentUser.email}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-medium">
              {currentUser.role}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/leads"
            className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs flex items-center gap-2"
          >
            <span>Back to My Pipeline</span>
            <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">G L</span>
          </Link>
          <Link
            href="/login"
            className="px-3.5 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-md text-xs font-medium transition cursor-pointer"
          >
            Switch Role Account →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-200 pb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
              <Settings className="w-4 h-4 text-zinc-500" />
              <span>Operations & Micro-Settings Hub</span>
            </h1>
            {currentUser.role === 'admin' ? (
              <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 border border-red-900/50 font-mono text-[10px] uppercase font-semibold">
                Super Admin Clearance
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-900/50 font-mono text-[10px] uppercase font-semibold">
                Manager Scoped View
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            System rules, business shifts, routing algorithms, regional currencies, audio synthesis, and taxonomies
          </p>
        </div>

        {savedSection && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs font-medium animate-in fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>Saved {savedSection}!</span>
          </div>
        )}
      </div>

      {/* Manager Scoped Notice Banner */}
      {currentUser.role === 'manager' && (
        <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-md flex items-center justify-between text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <div>
              <strong className="font-semibold">Manager Scoped View:</strong> Routing strategies, notification presets, custom taxonomies, and webhooks are active. System backup snapshots and base financial commission gates are restricted to Super Admin.
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300 uppercase font-medium flex-shrink-0 ml-2">
            TRV-MGR Clearance
          </span>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 pb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-t-md transition border-b-2 whitespace-nowrap min-h-[40px] ${
                isActive
                  ? 'border-zinc-950 text-zinc-950 bg-white font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`} />
              <span>{tab.label}</span>
              {tab.lock && (
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-100 text-zinc-500 border border-zinc-200 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5" />
                  <span>{tab.lock}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: SLA & Business Hours */}
      {activeTab === 'sla' && (
        <div className="relative">
          {/* Manager Read-Only Overlay */}
          {currentUser.role === 'manager' && (
            <div className="absolute inset-0 z-10 rounded-lg bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6 border border-zinc-200 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-3">
                <Lock className="w-5 h-5 text-zinc-500" />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-1">Read-Only Preview</div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1.5">SLA Thresholds Locked to Super Admin</h3>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-xs">
                First Response Time timers, breach escalation rules, and shift hours are restricted to agency administrators. Contact your admin to modify these policies.
              </p>
              <span className="mt-3 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 uppercase">TRV-ADMIN clearance required</span>
            </div>
          )}
        <form onSubmit={handleSaveSla} className="space-y-4 text-xs">
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                First Response Time (FRT) & Escalations
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Define the response speed expectations and alert thresholds for incoming travel inquiries
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Target First Contact SLA (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="480"
                    value={frtMinutes}
                    onChange={(e) => setFrtMinutes(Number(e.target.value))}
                    aria-label="Target first contact SLA in minutes"
                    className="w-24 border border-zinc-200 rounded p-1.5 font-mono font-medium text-zinc-900 bg-white text-xs"
                  />
                  <span className="text-zinc-500 text-xs">mins from assignment</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Inquiries untouched past this duration receive an SLA Breached badge and alert managers.
                </p>
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Pre-Breach Warning Buffer (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={preBreachWarningMinutes}
                    onChange={(e) => setPreBreachWarningMinutes(Number(e.target.value))}
                    aria-label="Pre-breach warning buffer in minutes"
                    className="w-24 border border-zinc-200 rounded p-1.5 font-mono font-medium text-zinc-900 bg-white text-xs"
                  />
                  <span className="text-zinc-500 text-xs">mins before breach</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Triggers an amber warning dot and sends advance prompt to consultant.
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-zinc-100">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={escalateToManager}
                  onChange={(e) => setEscalateToManager(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Notify Sales Manager immediately when any consultant breaches First Response SLA</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={autoReassign}
                  onChange={(e) => setAutoReassign(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Automatically reassign inquiries neglected after threshold to next available consultant</span>
              </label>

              {autoReassign && (
                <div className="flex items-center gap-2 ml-5 pt-1">
                  <input
                    type="number"
                    min="1"
                    max="72"
                    value={reassignHours}
                    onChange={(e) => setReassignHours(Number(e.target.value))}
                    aria-label="Auto-reassignment threshold hours"
                    className="w-20 border border-zinc-200 rounded p-1 font-mono text-zinc-900 bg-white text-xs"
                  />
                  <span className="text-zinc-500 text-xs">hours uncontacted</span>
                </div>
              )}
            </div>
          </div>

          {/* Business Shifts & Weekend Freeze */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-zinc-500" />
                <span>Agency Operating Shifts & Timezone</span>
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Prevent unfair SLA breach penalties when leads arrive during closed office hours or weekends
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Shift Start Time
                </label>
                <input
                  type="time"
                  value={businessHoursStart}
                  onChange={(e) => setBusinessHoursStart(e.target.value)}
                  aria-label="Shift start time"
                  className="border border-zinc-200 rounded p-1.5 font-mono text-zinc-900 bg-white text-xs w-full"
                />
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Shift End Time
                </label>
                <input
                  type="time"
                  value={businessHoursEnd}
                  onChange={(e) => setBusinessHoursEnd(e.target.value)}
                  aria-label="Shift end time"
                  className="border border-zinc-200 rounded p-1.5 font-mono text-zinc-900 bg-white text-xs w-full"
                />
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Operating Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  aria-label="Agency operating timezone"
                  className="border border-zinc-200 rounded p-1.5 text-zinc-900 bg-white text-xs w-full"
                >
                  <option value="America/New_York (EST)">America/New_York (EST)</option>
                  <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                  <option value="Europe/London (GMT)">Europe/London (GMT)</option>
                  <option value="Asia/Singapore (SGT)">Asia/Singapore (SGT)</option>
                  <option value="Australia/Sydney (AEST)">Australia/Sydney (AEST)</option>
                  <option value="Asia/Dubai (GST)">Asia/Dubai (GST)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={freezeSlaWeekends}
                  onChange={(e) => setFreezeSlaWeekends(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Freeze SLA timers during non-working days (Saturday & Sunday)</span>
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition"
              >
                Save SLA & Shift Rules
              </button>
            </div>
          </div>
        </form>
        </div>
      )}

      {/* TAB 2: Routing Engine */}
      {activeTab === 'routing' && (
        <form onSubmit={handleSaveRouting} className="space-y-4 text-xs">
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Distribution Strategy & Triage Engine
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Configure algorithm mode for routing newly ingested travel leads across consultants
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-2">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Routing Algorithm Mode
                </label>
                <select
                  value={routingStrategy}
                  onChange={(e) => setRoutingStrategy(e.target.value as RoutingStrategy)}
                  aria-label="Routing algorithm mode"
                  className="w-full border border-zinc-200 rounded p-1.5 text-zinc-900 bg-white text-xs"
                >
                  <option value="workload_balanced">Workload-Balanced (Lowest Utilization Ratio)</option>
                  <option value="round_robin">Strict Round-Robin (Sequential Cycling)</option>
                  <option value="conversion_weighted">Performance-Weighted (Highest Win Rate First)</option>
                </select>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {routingStrategy === 'workload_balanced' &&
                    'Allocates inquiry to eligible destination specialist with lowest current_load / max_capacity ratio.'}
                  {routingStrategy === 'round_robin' &&
                    'Evenly alternates leads across specialists in alphabetical sequence.'}
                  {routingStrategy === 'conversion_weighted' &&
                    'Favors consultants with top conversion percentages to maximize deal closing.'}
                </p>
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-2">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Full-Capacity Overflow Policy
                </label>
                <select
                  value={overflowPolicy}
                  onChange={(e) => setOverflowPolicy(e.target.value as RoutingOverflowPolicy)}
                  aria-label="Full-capacity overflow policy"
                  className="w-full border border-zinc-200 rounded p-1.5 text-zinc-900 bg-white text-xs"
                >
                  <option value="unassigned_pool">Hold in Unassigned Pool (Triage / Manual Claim)</option>
                  <option value="overflow_available">Overflow to Any Available Consultant</option>
                  <option value="queue_delay">Hold in Queue with Delayed Assignment</option>
                </select>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Controls how inquiries are handled when all matching destination specialists are at 100% capacity.
                </p>
              </div>
            </div>

            {/* VIP Override */}
            <div className="pt-2 border-t border-zinc-100 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-900">VIP / High-Budget Deal Override</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                  <label className="block text-[11px] font-medium text-zinc-700">
                    VIP Inquiry Budget Threshold ($)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-500">$</span>
                    <input
                      type="number"
                      step="500"
                      min="1000"
                      max="50000"
                      value={vipThreshold}
                      onChange={(e) => setVipThreshold(Number(e.target.value))}
                      aria-label="VIP inquiry budget threshold"
                      className="w-28 border border-zinc-200 rounded p-1.5 font-mono text-zinc-900 bg-white text-xs"
                    />
                  </div>
                </div>

                <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                  <label className="block text-[11px] font-medium text-zinc-700">
                    Inbound Lead Cooldown (Minutes)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={leadCooldown}
                      onChange={(e) => setLeadCooldown(Number(e.target.value))}
                      aria-label="Inbound lead cooldown minutes"
                      className="w-20 border border-zinc-200 rounded p-1.5 font-mono text-zinc-900 bg-white text-xs"
                    />
                    <span className="text-zinc-500 text-xs">mins between leads per agent</span>
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={vipSeniorsOnly}
                  onChange={(e) => setVipSeniorsOnly(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Route VIP inquiries and Priority: Urgent leads exclusively to Team Leads & Senior Consultants</span>
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition"
              >
                Save Routing Strategy
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: Currency & Financials */}
      {activeTab === 'financials' && (
        <div className="relative">
          {/* Manager Read-Only Overlay */}
          {currentUser.role === 'manager' && (
            <div className="absolute inset-0 z-10 rounded-lg bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6 border border-zinc-200 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-3">
                <Lock className="w-5 h-5 text-zinc-500" />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider font-semibold text-zinc-400 mb-1">Read-Only Preview</div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-1.5">Financial Gates Locked to Super Admin</h3>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-xs">
                Base profit margin penalties, commission TDS rates, and currency settings are restricted to agency administrators to protect financial integrity.
              </p>
              <span className="mt-3 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200 uppercase">TRV-ADMIN clearance required</span>
            </div>
          )}
        <form onSubmit={handleSaveFinancials} className="space-y-4 text-xs">
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Currency, Regional & Payout Rules
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Set base accounting currency, margin penalty gates, and withholding tax deductions
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-2">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Base Agency Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  aria-label="Base agency currency"
                  className="w-full border border-zinc-200 rounded p-1.5 text-zinc-900 bg-white text-xs font-medium"
                >
                  <option value="USD">USD ($) - United States Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                  <option value="INR">INR (₹) - Indian Rupee</option>
                  <option value="AUD">AUD (A$) - Australian Dollar</option>
                  <option value="AED">AED (AED) - UAE Dirham</option>
                </select>
                <div className="text-[11px] text-zinc-500 flex items-center gap-2">
                  <span>Live Formatting Preview:</span>
                  <span className="font-mono font-semibold text-zinc-900">{formatCurrency(14500)}</span>
                </div>
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-2">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Itinerary Date Format
                </label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                  aria-label="Itinerary date format"
                  className="w-full border border-zinc-200 rounded p-1.5 text-zinc-900 bg-white text-xs font-mono"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 11/09/2026)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 09/11/2026)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-09-11)</option>
                </select>
                <p className="text-[11px] text-zinc-400">
                  Applied across travel dates, callback schedules, and reporting.
                </p>
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Minimum Gross Profit Margin Gate (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={minMargin}
                    onChange={(e) => setMinMargin(Number(e.target.value))}
                    aria-label="Minimum gross profit margin gate percentage"
                    className="w-20 border border-zinc-200 rounded p-1.5 font-mono text-zinc-900 bg-white text-xs"
                  />
                  <span className="text-zinc-500 font-mono text-xs">%</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Packages sold under this threshold suffer a 50% commission rate cut on the deal.
                </p>
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-1.5">
                <label className="block text-[11px] font-medium text-zinc-700">
                  TDS / Commission Tax Withholding (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={tdsPct}
                    onChange={(e) => setTdsPct(Number(e.target.value))}
                    aria-label="TDS commission tax withholding percentage"
                    className="w-20 border border-zinc-200 rounded p-1.5 font-mono text-zinc-900 bg-white text-xs"
                  />
                  <span className="text-zinc-500 font-mono text-xs">%</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-tight">
                  Automatically deducted in Payout Reports to show consultants Net Disbursable Commission.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition"
              >
                Save Currency & Payout Rules
              </button>
            </div>
          </div>
        </form>
        </div>
      )}

      {/* TAB 4: Audio & Notifications */}
      {activeTab === 'audio' && (
        <form onSubmit={handleSaveAudio} className="space-y-4 text-xs">
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Web Audio Chimes & Notification Alerts
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Custom Web Audio synthesizer envelopes, volume levels, and call suppression rules
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-2">
                <label className="block text-[11px] font-medium text-zinc-700">
                  Notification Sound Preset
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={soundPreset}
                    onChange={(e) => setSoundPreset(e.target.value as SoundPreset)}
                    aria-label="Notification sound preset"
                    className="flex-1 border border-zinc-200 rounded p-1.5 text-zinc-900 bg-white text-xs font-medium"
                  >
                    <option value="chime">Chime (Classic Dual Harmonic)</option>
                    <option value="modern_bell">Modern Bell (Crisp Triangle Wave)</option>
                    <option value="radar">Radar Ping (Urgent Attention Alert)</option>
                    <option value="subtle">Subtle (Soft Low Warm Tone)</option>
                    <option value="off">Mute / Off</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => playNotificationSound(soundPreset, volume)}
                    aria-label="Play test sound preset"
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded text-xs font-medium flex items-center gap-1"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Test</span>
                  </button>
                </div>
              </div>

              <div className="bg-zinc-50 p-3 rounded-md border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-700">
                    Audio Chime Volume
                  </label>
                  <span className="font-mono text-zinc-900 font-semibold">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Audio chime volume slider"
                  className="w-full accent-zinc-900 cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Enable audio chimes for new incoming leads & overdue SLA alerts</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={muteInCall}
                  onChange={(e) => setMuteInCall(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Automatically suppress/mute sound alerts when consultant status is set to "In Call"</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={browserPush}
                  onChange={(e) => setBrowserPush(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Send Browser Desktop Notifications for SLA breaches and reassignments</span>
              </label>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-100">
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded-md text-xs font-medium shadow-2xs transition"
              >
                Save Audio & Alert Settings
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 5: Taxonomies */}
      {activeTab === 'taxonomies' && (
        <div className="space-y-4 text-xs">
          {/* Lost Reasons Manager */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Lost Inquiry Taxonomy Manager
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Manage the root cause taxonomy used for debriefing and lost deal analytics
              </p>
            </div>

            <form onSubmit={handleAddReason} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Visa Denied / Passport Issue"
                value={newReasonInput}
                onChange={(e) => setNewReasonInput(e.target.value)}
                aria-label="New lost reason name"
                className="flex-1 border border-zinc-200 rounded p-1.5 text-xs text-zinc-900 bg-zinc-50"
              />
              <button
                type="submit"
                aria-label="Add lost reason"
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded text-xs font-medium flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Reason</span>
              </button>
            </form>

            <div className="divide-y divide-zinc-100 max-h-56 overflow-y-auto border border-zinc-100 rounded-md">
              {lostReasons.map((r) => (
                <div key={r} className="p-2 flex items-center justify-between hover:bg-zinc-50">
                  <span className="text-zinc-700 font-medium">{r}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteReason(r)}
                    aria-label={`Delete lost reason ${r}`}
                    className="p-1 text-zinc-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Lead Sources Manager */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <div>
              <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                Lead Acquisition Channels
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Channel tags for webhook routing and ROI attribution
              </p>
            </div>

            <form onSubmit={handleAddSource} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. instagram_dm, trade_show"
                value={newSourceInput}
                onChange={(e) => setNewSourceInput(e.target.value)}
                aria-label="New lead source tag"
                className="flex-1 border border-zinc-200 rounded p-1.5 text-xs text-zinc-900 bg-zinc-50 font-mono"
              />
              <button
                type="submit"
                aria-label="Add lead source"
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-50 rounded text-xs font-medium flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Channel</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {leadSources.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 border border-zinc-200 text-zinc-800 font-mono text-[11px]"
                >
                  <span>{s}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSource(s)}
                    aria-label={`Remove source ${s}`}
                    className="text-zinc-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Integrations & Roster */}
      {activeTab === 'integrations' && (
        <div className="space-y-4 text-xs">
          {/* Public Ingestion Webhook */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-zinc-700" />
                <div>
                  <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                    External Ingestion Webhook
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    Connect website landing pages, Meta Lead Ads, or Zapier workflows
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={copyWebhookCode}
                aria-label="Copy curl webhook command"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition"
              >
                {copiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedWebhook ? 'Copied command!' : 'Copy curl Sample'}</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between bg-zinc-50 p-2 rounded-md border border-zinc-200 font-mono text-xs text-zinc-800">
                <span>POST http://localhost:3000/api/leads/webhook</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-zinc-200 rounded font-mono text-zinc-700">
                  REST / JSON
                </span>
              </div>

              <div className="bg-zinc-950 text-zinc-200 rounded-md p-3 font-mono text-[11px] overflow-x-auto leading-relaxed border border-zinc-800">
                <pre>{sampleWebhookPayload}</pre>
              </div>
            </div>
          </div>

          {/* Consultant Roster */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-700" />
                <div>
                  <h2 className="text-xs font-semibold text-zinc-900 tracking-tight">
                    Consultant Roster & Routing Tags
                  </h2>
                  <p className="text-[11px] text-zinc-500">
                    Destination specialties and real-time workload limits used by auto-distribution
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-zinc-100">
              {allProfiles.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={p.avatar_url}
                      alt={p.full_name}
                      className="w-7 h-7 rounded-full object-cover border border-zinc-200"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/team/${p.id}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {p.full_name}
                        </a>
                        <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-mono bg-zinc-100 text-zinc-700 border border-zinc-200">
                          {p.role}
                        </span>
                        {p.accepting_leads === false && (
                          <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-amber-50 text-amber-800 border border-amber-200">
                            Routing Paused
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-400 font-mono">{p.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex flex-wrap gap-1 max-w-xs justify-end">
                      {p.destination_tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-700 text-[10px] font-mono"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="text-right min-w-[70px]">
                      <span className="font-mono font-medium text-zinc-900 block text-xs">
                        {p.current_load} / {p.max_capacity}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">active load</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: Storage & Data Backup */}
      {activeTab === 'storage' && (
        <div className="space-y-4 text-xs">

          {/* Manager: Admin Clearance Required Lock Card */}
          {currentUser.role === 'manager' && (
            <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8 flex flex-col items-center justify-center text-center min-h-[360px]">
              <div className="w-14 h-14 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-4 shadow-xs">
                <ShieldAlert className="w-7 h-7 text-zinc-500" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-3">
                <Lock className="w-3 h-3" />
                <span>Administrator Clearance Required</span>
              </div>
              <h2 className="text-base font-bold tracking-tight text-zinc-900 mb-2">
                Database Snapshots &amp; Restore Operations
              </h2>
              <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mb-5">
                Full database backup exports, JSON snapshot restores, and factory data resets require Super Admin authorization. These operations can permanently alter or erase all client, financial, and audit records.
              </p>
              <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3.5 text-left text-xs max-w-sm w-full space-y-2 mb-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold mb-1.5">Operations Restricted to Admin</div>
                {[
                  'Export Full CRM JSON Snapshot',
                  'Restore from Backup File',
                  'Factory Reset to Demo Dataset',
                ].map((op) => (
                  <div key={op} className="flex items-center gap-2 text-zinc-600">
                    <Lock className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                    <span>{op}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">
                Signed in as <strong className="text-zinc-600">{currentUser.full_name}</strong> · Manager Clearance
              </p>
            </div>
          )}

          {/* Admin: Full storage controls */}
          {currentUser.role === 'admin' && (
            <>
          {/* Status feedback banner if any */}
          {backupStatus.type !== 'idle' && (
            <div
              className={`p-3 rounded-md border flex items-center justify-between ${
                backupStatus.type === 'success'
                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50/60 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {backupStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                )}
                <span className="font-medium">{backupStatus.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setBackupStatus({ type: 'idle' })}
                aria-label="Dismiss message"
                className="text-zinc-500 hover:text-zinc-800 text-xs font-mono px-2 py-0.5"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Storage Health & Metrics Card */}
          <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-zinc-100">
              <div>
                <h2 className="text-xs font-semibold text-zinc-900 tracking-tight flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-zinc-600" />
                  <span>Client Storage Persistence & Sync Engine</span>
                </h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  All CRM records, quotations, audit histories, and team configurations are hydrated and synchronized to local browser storage
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-zinc-50 border border-zinc-200 text-zinc-700">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isHydrated ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  {isHydrated ? 'Storage Synchronized' : 'Hydrating...'}
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-50/80 p-3 rounded-md border border-zinc-200">
                <span className="text-[11px] text-zinc-500 block font-medium">Total Inquiries</span>
                <span className="text-lg font-semibold font-mono text-zinc-900 mt-0.5 block">
                  {allLeads.length}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {allLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost').length} active pipeline
                </span>
              </div>

              <div className="bg-zinc-50/80 p-3 rounded-md border border-zinc-200">
                <span className="text-[11px] text-zinc-500 block font-medium">Won Ledger Deals</span>
                <span className="text-lg font-semibold font-mono text-zinc-900 mt-0.5 block">
                  {allLeads.filter((l) => l.stage === 'won').length}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  revenue ledger records
                </span>
              </div>

              <div className="bg-zinc-50/80 p-3 rounded-md border border-zinc-200">
                <span className="text-[11px] text-zinc-500 block font-medium">Scheduled Callbacks</span>
                <span className="text-lg font-semibold font-mono text-zinc-900 mt-0.5 block">
                  {followUps.length}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {followUps.filter((f) => f.status === 'pending').length} pending follow-ups
                </span>
              </div>

              <div className="bg-zinc-50/80 p-3 rounded-md border border-zinc-200">
                <span className="text-[11px] text-zinc-500 block font-medium">Audit Log Events</span>
                <span className="text-lg font-semibold font-mono text-zinc-900 mt-0.5 block">
                  {activities.length}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {allProfiles.length} consultant profiles
                </span>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-zinc-500 flex items-center justify-between">
              <span className="font-mono text-[10px]">
                Storage Key: <code className="bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200 text-zinc-800 font-medium">wanderlust_crm_v1</code>
              </span>
              <span className="text-zinc-400 text-[10px]">Auto-saved on every mutation</span>
            </div>
          </div>

          {/* Backup & Restore Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Export JSON Backup */}
            <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-zinc-100 text-zinc-800">
                    <Download className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-900">Export Full CRM Snapshot</h3>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Generates an RFC-compliant JSON document containing all leads, quotes, itinerary lines, agent assignments, commission tiers, and audit activity.
                </p>
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-[10px] font-mono text-zinc-600">
                    <FileJson className="w-3 h-3 text-zinc-400" />
                    wanderlust_crm_backup_{new Date().toISOString().slice(0, 10)}.json
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  aria-label="Download full CRM JSON backup"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JSON Backup</span>
                </button>
              </div>
            </div>

            {/* Restore JSON Backup */}
            <div className="bg-white rounded-lg p-4 border border-zinc-200 shadow-2xs flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-zinc-100 text-zinc-800">
                    <Upload className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-900">Restore CRM Snapshot</h3>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Import a previously saved JSON snapshot file. The system will parse and restore all inquiries, quotations, follow-ups, and preferences into browser storage.
                </p>
                <input
                  type="file"
                  ref={restoreFileInputRef}
                  onChange={handleFileImport}
                  accept=".json,application/json"
                  className="hidden"
                  aria-label="Select JSON backup file to restore"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => restoreFileInputRef.current?.click()}
                  aria-label="Upload and restore CRM backup file"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Select & Restore JSON Backup</span>
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone: Factory Reset */}
          <div className="bg-white rounded-lg p-4 border border-rose-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-rose-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-rose-950">Danger Zone: Reset Demo Data</h3>
                  <p className="text-[11px] text-rose-700/80 mt-0.5">
                    Clear client localStorage cache and revert all entities to factory seed dataset
                  </p>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-zinc-600 leading-relaxed">
              This action purges all manually created leads, custom quotations, logged activities, and edited SLA rules, repopulating the CRM with clean seed inquiries and consultant profiles.
            </p>

            {showResetConfirm ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 text-rose-900 font-medium text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>Are you sure? This will wipe current browser storage and restore default demo data.</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    aria-label="Confirm factory reset"
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-medium transition cursor-pointer shadow-2xs"
                  >
                    Yes, Reset Everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    aria-label="Cancel factory reset"
                    className="px-3 py-1.5 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 rounded-md text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                aria-label="Open reset confirmation"
                className="flex items-center gap-2 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-md text-xs font-medium transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset to Factory Defaults</span>
              </button>
            )}
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

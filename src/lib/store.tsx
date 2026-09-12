'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Profile,
  Lead,
  FollowUp,
  ActivityLog,
  WhatsAppTemplate,
  SlaSettings,
  AgencySettings,
  AppNotification,
  AgentStatus,
  LeadStage,
  FollowUpChannel,
  ActivityType,
  IncentiveTier,
  CommissionStatus,
  UserPreferences,
  SoundPreset,
  CurrencyCode,
  DateFormat,
  RoutingStrategy,
  RoutingOverflowPolicy,
  LeadQuotation,
  MealPlanCode,
  ItineraryDay,
  PaymentMethod,
  PaymentMilestone,
  PaymentRecord,
  VisaStatus,
  TravelerPassenger,
  TravelerDocument,
  DmcPaymentStatus,
  DmcSupplier,
  LeadSupplierPayable,
  TripLifecycleStatus,
  PreDepartureChecklist,
  PostTripReview,
  FollowUpDisposition,
  FollowUpDispositionType,
  EmployeeHealthScore,
} from './types';
import {
  INITIAL_PROFILES,
  INITIAL_LEADS,
  INITIAL_FOLLOW_UPS,
  INITIAL_ACTIVITIES,
  INITIAL_TEMPLATES,
  INITIAL_SLA,
  INITIAL_NOTIFICATIONS,
  INITIAL_INCENTIVE_TIERS,
} from './supabase/mock-data';

interface AppContextType {
  currentUser: Profile;
  allProfiles: Profile[];
  leads: Lead[];
  allLeads: Lead[];
  followUps: FollowUp[];
  activities: ActivityLog[];
  templates: WhatsAppTemplate[];
  slaSettings: AgencySettings;
  agencySettings: AgencySettings;
  notifications: AppNotification[];
  unreadCount: number;
  incentiveTiers: IncentiveTier[];
  isAuthenticated: boolean;
  login: (email: string, password?: string) => { success: boolean; error?: string };
  logout: () => void;
  switchUser: (profileId: string) => void;
  updateAgentStatus: (status: AgentStatus) => void;
  addLead: (lead: Partial<Lead>) => Lead;
  updateLeadStage: (
    leadId: string,
    stage: LeadStage,
    lostReason?: string,
    lostNotes?: string,
    financials?: {
      packageSalePrice: number;
      vendorNetCost: number;
    }
  ) => void;
  assignLead: (leadId: string, agentId: string) => void;
  logActivity: (data: {
    leadId: string;
    type: ActivityType;
    title: string;
    outcome?: string;
    notes?: string;
    duration?: number;
    nextFollowUp?: {
      scheduled_at: string;
      channel: FollowUpChannel;
      title?: string;
      notes?: string;
    };
  }) => void;
  completeFollowUp: (followUpId: string, completionNotes?: string) => void;
  createFollowUp: (data: Partial<FollowUp>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  updateSlaSettings: (settings: Partial<AgencySettings>) => void;
  updateAgencySettings: (settings: Partial<AgencySettings>) => void;
  updateUserPreferences: (profileId: string, prefs: Partial<UserPreferences>) => void;
  updateTemplates: (templates: WhatsAppTemplate[]) => void;
  updateIncentiveTiers: (tiers: IncentiveTier[]) => void;
  approveCommissionPayout: (leadId: string, newStatus?: CommissionStatus) => void;
  getAgentIncentiveProfile: (agentId: string) => {
    currentTier: IncentiveTier;
    nextTier: IncentiveTier | null;
    totalSales: number;
    totalGrossProfit: number;
    avgProfitMargin: number;
    accruedCommission: number;
    approvedCommission: number;
    paidCommission: number;
    salesToNextTier: number;
    progressPct: number;
    wonDealsCount: number;
  };
  updateProfile: (profileId: string, updates: Partial<Profile>) => void;
  createProfile: (data: Omit<Profile, 'id' | 'created_at' | 'current_load'>) => Profile;
  toggleAgentAcceptingLeads: (profileId: string) => void;
  bulkReassignAgentLeads: (fromAgentId: string, toAgentId: string) => number;
  getAgentMetrics: (agentId: string) => {
    totalAssigned: number;
    activeLeads: number;
    wonCount: number;
    lostCount: number;
    winRate: number;
    revenue: number;
    grossProfit: number;
    avgFrtMinutes: number;
    breaches: number;
    activityCount: number;
    capacityPct: number;
  };
  playNotificationSound: (preset?: SoundPreset, customVolume?: number) => void;
  formatCurrency: (amount: number) => string;
  formatAppDate: (date: string | Date) => string;
  isHydrated: boolean;
  resetToFactoryDefaults: () => void;
  exportCrmBackup: () => void;
  importCrmBackup: (jsonData: string) => boolean;
  createLeadQuotation: (leadId: string, quoteData: Partial<LeadQuotation>) => LeadQuotation;
  bulkAssignLeads: (leadIds: string[], agentId: string) => void;
  bulkUpdateLeadStage: (leadIds: string[], stage: LeadStage) => void;
  addPaymentRecord: (
    leadId: string,
    payment: {
      amount: number;
      method: PaymentMethod;
      reference_no?: string;
      notes?: string;
    }
  ) => PaymentRecord;
  updatePaymentMilestones: (leadId: string, milestones: PaymentMilestone[]) => void;
  updateItineraryDays: (leadId: string, days: ItineraryDay[]) => void;
  addPassenger: (
    leadId: string,
    passenger: Omit<TravelerPassenger, 'id' | 'lead_id'>
  ) => TravelerPassenger;
  updatePassenger: (
    leadId: string,
    passengerId: string,
    updates: Partial<TravelerPassenger>
  ) => void;
  deletePassenger: (leadId: string, passengerId: string) => void;
  addDocument: (
    leadId: string,
    document: Omit<TravelerDocument, 'id' | 'lead_id' | 'uploaded_at'>
  ) => TravelerDocument;
  deleteDocument: (leadId: string, documentId: string) => void;
  updatePreDepartureChecklist: (leadId: string, checklist: Partial<PreDepartureChecklist>) => void;
  updateSupplierPayables: (leadId: string, payables: LeadSupplierPayable[]) => void;
  recordPostTripReview: (leadId: string, review: PostTripReview) => void;
  updateTripStatus: (leadId: string, status: TripLifecycleStatus) => void;
  executeFollowUpDisposition: (leadId: string, followUpId: string, disposition: FollowUpDisposition) => void;
  getAgentHealthScore: (agentId: string) => EmployeeHealthScore;
  rebalanceOverdueFollowUps: (fromAgentId: string, toAgentId?: string) => number;
  exportFollowUpsIcal: (tasks?: FollowUp[]) => void;
  toast: {
    message: string;
    type?: 'success' | 'info' | 'warning' | 'error';
    id: number;
  } | null;
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  hideToast: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_PROFILES);
  const [currentUserId, setCurrentUserId] = useState<string>(INITIAL_PROFILES[0].id);
  const [leadsList, setLeadsList] = useState<Lead[]>(INITIAL_LEADS);
  const [followUpsList, setFollowUpsList] = useState<FollowUp[]>(INITIAL_FOLLOW_UPS);
  const [activitiesList, setActivitiesList] = useState<ActivityLog[]>(INITIAL_ACTIVITIES);
  const [templatesList, setTemplatesList] = useState<WhatsAppTemplate[]>(INITIAL_TEMPLATES);
  const [sla, setSla] = useState<AgencySettings>(INITIAL_SLA);
  const [notificationsList, setNotificationsList] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [tiers, setTiers] = useState<IncentiveTier[]>(INITIAL_INCENTIVE_TIERS);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'info' | 'warning' | 'error';
    id: number;
  } | null>(null);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hideToast = useCallback(() => {
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      const id = Date.now();
      setToast({ message, type, id });
      const duration = (sla?.toast_duration_seconds || 3) * 1000;
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
      }, duration);
    },
    [sla?.toast_duration_seconds]
  );

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('wanderlust_crm_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.profiles && Array.isArray(parsed.profiles)) setProfiles(parsed.profiles);
          if (parsed.currentUserId && typeof parsed.currentUserId === 'string') setCurrentUserId(parsed.currentUserId);
          if (typeof parsed.isAuthenticated === 'boolean') setIsAuthenticated(parsed.isAuthenticated);
          if (parsed.leadsList && Array.isArray(parsed.leadsList)) setLeadsList(parsed.leadsList);
          if (parsed.followUpsList && Array.isArray(parsed.followUpsList)) setFollowUpsList(parsed.followUpsList);
          if (parsed.activitiesList && Array.isArray(parsed.activitiesList)) setActivitiesList(parsed.activitiesList);
          if (parsed.templatesList && Array.isArray(parsed.templatesList)) setTemplatesList(parsed.templatesList);
          if (parsed.sla && typeof parsed.sla === 'object') setSla(parsed.sla);
          if (parsed.notificationsList && Array.isArray(parsed.notificationsList)) setNotificationsList(parsed.notificationsList);
          if (parsed.tiers && Array.isArray(parsed.tiers)) setTiers(parsed.tiers);
        }
      }
    } catch (e) {
      console.warn('Could not hydrate CRM from localStorage:', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save to localStorage whenever state changes after initial hydration
  useEffect(() => {
    if (!isHydrated) return;
    try {
      if (typeof window !== 'undefined') {
        const payload = {
          profiles,
          currentUserId,
          isAuthenticated,
          leadsList,
          followUpsList,
          activitiesList,
          templatesList,
          sla,
          notificationsList,
          tiers,
        };
        localStorage.setItem('wanderlust_crm_v1', JSON.stringify(payload));
      }
    } catch (e) {
      console.warn('Could not save CRM to localStorage:', e);
    }
  }, [
    isHydrated,
    profiles,
    currentUserId,
    isAuthenticated,
    leadsList,
    followUpsList,
    activitiesList,
    templatesList,
    sla,
    notificationsList,
    tiers,
  ]);

  const currentUser = profiles.find((p) => p.id === currentUserId) || profiles[0];

  const playNotificationSound = (presetOverride?: SoundPreset, customVolume?: number) => {
    try {
      if (typeof window === 'undefined') return;
      const validPresets: SoundPreset[] = ['chime', 'modern_bell', 'radar', 'subtle', 'off'];
      const hasValidPreset = typeof presetOverride === 'string' && validPresets.includes(presetOverride);
      const isManualTest = hasValidPreset;

      if (!sla.notification_sound_enabled && !isManualTest) return;
      if (sla.mute_sound_in_call && currentUser.status === 'in_call' && !isManualTest) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const preset = hasValidPreset ? presetOverride : (sla.notification_sound_preset || 'chime');
      if (preset === 'off') return;

      const volMultiplier = Math.max(0.01, (customVolume ?? sla.notification_volume ?? 75) / 100);
      const baseGain = 0.25 * volMultiplier;

      if (preset === 'chime') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(baseGain, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.36);
      } else if (preset === 'modern_bell') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(baseGain * 1.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (preset === 'radar') {
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1046.5, ctx.currentTime);
        gain1.gain.setValueAtTime(baseGain, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.13);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.15);
        gain2.gain.setValueAtTime(baseGain, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.33);
      } else if (preset === 'subtle') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(baseGain * 0.7, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch (e) {
      console.warn('Audio notification note:', e);
    }
  };

  const formatCurrency = (amount: number) => {
    const sym = sla.currency_symbol || '$';
    return `${sym}${Math.round(amount).toLocaleString('en-US')}`;
  };

  const formatAppDate = (date: string | Date) => {
    if (!date) return '';
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-');
      const fmt = sla?.date_format || 'DD/MM/YYYY';
      if (fmt === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
      if (fmt === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
      return `${day}/${month}/${year}`;
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    const fmt = sla?.date_format || 'DD/MM/YYYY';
    if (fmt === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
    if (fmt === 'MM/DD/YYYY') return `${month}/${day}/${year}`;
    return `${day}/${month}/${year}`;
  };

  const login = (email: string, _password?: string) => {
    const normalized = email.trim().toLowerCase();
    const found = profiles.find((p) => p.email.toLowerCase() === normalized);
    if (!found) {
      return {
        success: false,
        error: 'No registered consultant or administrator found with that work email.',
      };
    }
    if (!found.is_active) {
      return {
        success: false,
        error: 'This account has been deactivated. Please contact your agency administrator.',
      };
    }

    setCurrentUserId(found.id);
    setIsAuthenticated(true);
    showToast(`Welcome back, ${found.full_name}! (${found.role.toUpperCase()})`, 'success');

    // Record login audit event
    const authLog: ActivityLog = {
      id: `act-auth-${Date.now()}`,
      lead_id: leadsList[0]?.id || 'system',
      agent_id: found.id,
      activity_type: 'system',
      title: 'Consultant Signed In',
      notes: `${found.full_name} authenticated via Workstation Auth Engine (${found.role})`,
      created_at: new Date().toISOString(),
    };
    setActivitiesList((prev) => [authLog, ...prev]);

    return { success: true };
  };

  const logout = () => {
    setIsAuthenticated(false);
    showToast('Signed out of Wanderlust CRM', 'info');
  };

  const switchUser = (profileId: string) => {
    const found = profiles.find((p) => p.id === profileId);
    if (found) {
      setCurrentUserId(found.id);
      setIsAuthenticated(true);
    }
  };

  const updateAgentStatus = (status: AgentStatus) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === currentUser.id ? { ...p, status } : p))
    );
  };

  const visibleLeads = leadsList.filter((lead) => {
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    return lead.assigned_to === currentUser.id || lead.assigned_to === null;
  });

  const userNotifications = notificationsList.filter((n) => n.user_id === currentUser.id);
  const unreadCount = userNotifications.filter((n) => !n.is_read).length;

  // Calculate incentive profile for any agent
  const getAgentIncentiveProfile = (agentId: string) => {
    const agentWonLeads = leadsList.filter(
      (l) => l.assigned_to === agentId && l.stage === 'won'
    );

    const totalSales = agentWonLeads.reduce(
      (sum, l) => sum + (l.package_sale_price || l.won_deal_value || 0),
      0
    );

    const totalGrossProfit = agentWonLeads.reduce(
      (sum, l) => sum + (l.gross_profit || 0),
      0
    );

    const avgProfitMargin =
      totalSales > 0 ? Math.round((totalGrossProfit / totalSales) * 1000) / 10 : 0;

    // Find active tier based on total monthly sales
    let currentTier = tiers[0];
    let nextTier: IncentiveTier | null = tiers[1] || null;

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (totalSales >= t.min_sales && (t.max_sales === null || totalSales < t.max_sales)) {
        currentTier = t;
        nextTier = tiers[i + 1] || null;
        break;
      }
    }

    const accruedCommission = agentWonLeads
      .filter((l) => l.commission_status === 'accrued')
      .reduce((sum, l) => sum + (l.agent_commission_earned || 0), 0);

    const approvedCommission = agentWonLeads
      .filter((l) => l.commission_status === 'approved')
      .reduce((sum, l) => sum + (l.agent_commission_earned || 0), 0);

    const paidCommission = agentWonLeads
      .filter((l) => l.commission_status === 'paid')
      .reduce((sum, l) => sum + (l.agent_commission_earned || 0), 0);

    const salesToNextTier = nextTier ? Math.max(0, nextTier.min_sales - totalSales) : 0;

    const progressPct = nextTier
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              ((totalSales - currentTier.min_sales) /
                (nextTier.min_sales - currentTier.min_sales)) *
                100
            )
          )
        )
      : 100;

    return {
      currentTier,
      nextTier,
      totalSales,
      totalGrossProfit,
      avgProfitMargin,
      accruedCommission,
      approvedCommission,
      paidCommission,
      salesToNextTier,
      progressPct,
      wonDealsCount: agentWonLeads.length,
    };
  };

  // Add new lead with Smart Hybrid Distribution
  const addLead = (leadData: Partial<Lead>): Lead => {
    const nextCodeNumber = leadsList.length + 1;
    const leadCode = `TRV-2026-${String(nextCodeNumber).padStart(4, '0')}`;

    let assignedAgentId = leadData.assigned_to || null;

    if (!assignedAgentId) {
      const targetDest = (leadData.destination || '').toLowerCase();
      // Check VIP threshold
      const estimatedBudgetStr = leadData.budget_range || '';
      const estimatedValue = parseInt(estimatedBudgetStr.replace(/[^0-9]/g, ''), 10) || 0;
      const isVip = leadData.priority === 'urgent' || (estimatedValue >= (sla.vip_high_budget_threshold || 8000));

      // Eligible candidate agents
      let candidateAgents = profiles.filter(
        (p) =>
          p.is_active &&
          p.status === 'available' &&
          p.accepting_leads !== false &&
          p.current_load < p.max_capacity
      );

      // VIP filter if enabled
      if (isVip && sla.vip_route_seniors_only) {
        const seniors = candidateAgents.filter(
          (p) => p.role === 'manager' || p.role === 'admin' || p.max_capacity >= 25
        );
        if (seniors.length > 0) {
          candidateAgents = seniors;
        }
      }

      // Filter by destination specialty
      const specialists = candidateAgents.filter((p) =>
        p.destination_tags.some((tag) =>
          targetDest.includes(tag.toLowerCase()) || tag.toLowerCase().includes(targetDest)
        )
      );

      const pool = specialists.length > 0 ? specialists : candidateAgents;

      if (pool.length > 0) {
        if (sla.routing_strategy === 'workload_balanced') {
          pool.sort((a, b) => a.current_load / a.max_capacity - b.current_load / b.max_capacity);
          assignedAgentId = pool[0].id;
        } else if (sla.routing_strategy === 'conversion_weighted') {
          pool.sort((a, b) => {
            const mA = getAgentMetrics(a.id);
            const mB = getAgentMetrics(b.id);
            return mB.winRate - mA.winRate;
          });
          assignedAgentId = pool[0].id;
        } else {
          // round_robin
          pool.sort((a, b) => a.current_load - b.current_load);
          assignedAgentId = pool[0].id;
        }
      } else if (sla.routing_overflow_policy === 'overflow_available') {
        const anyAvailable = profiles.find(
          (p) => p.is_active && p.status === 'available' && p.accepting_leads !== false
        );
        if (anyAvailable) assignedAgentId = anyAvailable.id;
      }
    }

    const nowIso = new Date().toISOString();
    const frtDueIso = new Date(Date.now() + sla.frt_minutes * 60 * 1000).toISOString();

    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      lead_code: leadCode,
      customer_name: leadData.customer_name || 'New Customer',
      customer_email: leadData.customer_email || '',
      customer_phone: leadData.customer_phone || '',
      customer_city: leadData.customer_city || '',
      customer_country: leadData.customer_country || 'India',
      destination: leadData.destination || 'Bali',
      travel_dates: leadData.travel_dates || 'Dates Flexible',
      duration_days: leadData.duration_days || 5,
      pax_adults: leadData.pax_adults ?? 2,
      pax_children: leadData.pax_children ?? 0,
      pax_infants: leadData.pax_infants ?? 0,
      travel_type: leadData.travel_type || 'family',
      budget_range: leadData.budget_range || '$1,500 - $2,500',
      hotel_category: leadData.hotel_category || '4-star',
      flight_required: leadData.flight_required ?? true,
      visa_required: leadData.visa_required ?? false,
      special_notes: leadData.special_notes || '',
      source: leadData.source || 'website',
      stage: 'new',
      priority: leadData.priority || 'normal',
      assigned_to: assignedAgentId,
      assigned_at: assignedAgentId ? nowIso : undefined,
      first_response_due_at: assignedAgentId ? frtDueIso : undefined,
      is_first_response_breached: false,
      next_follow_up_at: assignedAgentId ? frtDueIso : undefined,
      created_at: nowIso,
      updated_at: nowIso,
    };

    setLeadsList((prev) => [newLead, ...prev]);

    if (assignedAgentId) {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === assignedAgentId ? { ...p, current_load: p.current_load + 1 } : p
        )
      );

      const newNotif: AppNotification = {
        id: `notif-${Date.now()}`,
        user_id: assignedAgentId,
        title: 'New Lead Assigned',
        message: `${newLead.customer_name} (${newLead.destination}) has been routed to you.`,
        type: 'lead_assigned',
        link: `/leads/${newLead.id}`,
        is_read: false,
        created_at: nowIso,
      };
      setNotificationsList((prev) => [newNotif, ...prev]);
    }

    playNotificationSound();
    return newLead;
  };

  // Enhanced updateLeadStage with Profit & Incentive calculation
  const updateLeadStage = (
    leadId: string,
    stage: LeadStage,
    lostReason?: string,
    lostNotes?: string,
    financials?: {
      packageSalePrice: number;
      vendorNetCost: number;
    }
  ) => {
    const nowIso = new Date().toISOString();
    const targetLead = leadsList.find((l) => l.id === leadId);

    let salePrice = targetLead?.package_sale_price || targetLead?.won_deal_value || 2500;
    let vendorCost = targetLead?.vendor_net_cost || 1900;
    let profit = targetLead?.gross_profit || 600;
    let marginPct = targetLead?.profit_margin_pct || 24;
    let commission = targetLead?.agent_commission_earned || 54;
    let commissionStatus: CommissionStatus = targetLead?.commission_status || 'accrued';

    if (stage === 'won' && financials) {
      salePrice = financials.packageSalePrice;
      vendorCost = financials.vendorNetCost;
      profit = Math.max(0, salePrice - vendorCost);
      marginPct = salePrice > 0 ? Math.round((profit / salePrice) * 1000) / 10 : 0;

      // Determine active incentive tier for the assigned agent
      const agentId = targetLead?.assigned_to || currentUser.id;
      const agentProfile = getAgentIncentiveProfile(agentId);
      const activeTier = agentProfile.currentTier;

      // Minimum margin threshold check
      const meetsMarginGate = marginPct >= activeTier.min_margin_threshold;
      const effectiveRate = meetsMarginGate
        ? activeTier.commission_pct_profit
        : activeTier.commission_pct_profit * 0.5; // 50% penalty if heavy discounting eroded margin

      commission = Math.round(profit * (effectiveRate / 100) * 100) / 100;
      commissionStatus = 'accrued';
    }

    setLeadsList((prev) =>
      prev.map((lead) => {
        if (lead.id === leadId) {
          return {
            ...lead,
            stage,
            package_sale_price: stage === 'won' ? salePrice : lead.package_sale_price,
            vendor_net_cost: stage === 'won' ? vendorCost : lead.vendor_net_cost,
            gross_profit: stage === 'won' ? profit : lead.gross_profit,
            profit_margin_pct: stage === 'won' ? marginPct : lead.profit_margin_pct,
            agent_commission_earned: stage === 'won' ? commission : lead.agent_commission_earned,
            commission_status: stage === 'won' ? commissionStatus : lead.commission_status,
            won_deal_value: stage === 'won' ? salePrice : lead.won_deal_value,
            lost_reason: stage === 'lost' ? lostReason || 'other' : lead.lost_reason,
            lost_notes: stage === 'lost' ? lostNotes : lead.lost_notes,
            closed_at: stage === 'won' || stage === 'lost' ? nowIso : lead.closed_at,
            updated_at: nowIso,
          };
        }
        return lead;
      })
    );

    // Dynamic capacity adjustment: free up load when deals close (won/lost), re-claim load if reopened
    if (targetLead?.assigned_to) {
      const wasClosed = targetLead.stage === 'won' || targetLead.stage === 'lost';
      const isNowClosed = stage === 'won' || stage === 'lost';
      if (!wasClosed && isNowClosed) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === targetLead.assigned_to
              ? { ...p, current_load: Math.max(0, p.current_load - 1) }
              : p
          )
        );
      } else if (wasClosed && !isNowClosed) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === targetLead.assigned_to
              ? { ...p, current_load: Math.min(p.max_capacity, p.current_load + 1) }
              : p
          )
        );
      }
    }

    // Record activity log
    const newAct: ActivityLog = {
      id: `act-${Date.now()}`,
      lead_id: leadId,
      agent_id: currentUser.id,
      activity_type: 'stage_change',
      title: `Stage: ${stage.toUpperCase().replace('_', ' ')}`,
      outcome: stage === 'won' ? 'Won' : stage === 'lost' ? 'Lost' : 'Progressed',
      notes:
        stage === 'won'
          ? `Deal Won! Sale: $${salePrice.toLocaleString()} | Net Cost: $${vendorCost.toLocaleString()} | Gross Profit: $${profit.toLocaleString()} (${marginPct}% margin). Commission accrued: $${commission.toFixed(2)}.`
          : stage === 'lost'
          ? `Reason: ${lostReason}. ${lostNotes || ''}`
          : `Updated by ${currentUser.full_name}`,
      created_at: nowIso,
    };
    setActivitiesList((prev) => [newAct, ...prev]);
  };

  // Manager commission approval action
  const approveCommissionPayout = (leadId: string, newStatus: CommissionStatus = 'approved') => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, commission_status: newStatus, updated_at: nowIso } : l))
    );

    const lead = leadsList.find((l) => l.id === leadId);
    if (lead?.assigned_to) {
      const notif: AppNotification = {
        id: `notif-${Date.now()}`,
        user_id: lead.assigned_to,
        title: `Commission ${newStatus === 'paid' ? 'Paid! 💰' : 'Approved! ✅'}`,
        message: `Your $${lead.agent_commission_earned?.toFixed(2)} commission on ${lead.lead_code} has been marked as ${newStatus}.`,
        type: 'system',
        link: `/incentives`,
        is_read: false,
        created_at: nowIso,
      };
      setNotificationsList((prev) => [notif, ...prev]);
    }
  };

  const updateIncentiveTiers = (newTiers: IncentiveTier[]) => {
    setTiers(newTiers);
  };

  const assignLead = (leadId: string, agentId: string) => {
    const nowIso = new Date().toISOString();
    const frtDueIso = new Date(Date.now() + sla.frt_minutes * 60 * 1000).toISOString();
    const agent = profiles.find((p) => p.id === agentId);
    const targetLead = leadsList.find((l) => l.id === leadId);
    const oldAgentId = targetLead?.assigned_to;

    setLeadsList((prev) =>
      prev.map((lead) => {
        if (lead.id === leadId) {
          return {
            ...lead,
            assigned_to: agentId,
            assigned_at: nowIso,
            first_response_due_at: lead.first_contacted_at ? lead.first_response_due_at : frtDueIso,
            is_first_response_breached: false,
            updated_at: nowIso,
          };
        }
        return lead;
      })
    );

    // Adjust load counters for reassignment
    if (oldAgentId !== agentId) {
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id === agentId) return { ...p, current_load: p.current_load + 1 };
          if (p.id === oldAgentId) return { ...p, current_load: Math.max(0, p.current_load - 1) };
          return p;
        })
      );
    }

    const act: ActivityLog = {
      id: `act-${Date.now()}`,
      lead_id: leadId,
      agent_id: currentUser.id,
      activity_type: 'reassignment',
      title: `Reassigned to ${agent?.full_name || 'Agent'}`,
      notes: `Reassigned by ${currentUser.full_name}`,
      created_at: nowIso,
    };
    setActivitiesList((prev) => [act, ...prev]);
  };

  const logActivity = (data: {
    leadId: string;
    type: ActivityType;
    title: string;
    outcome?: string;
    notes?: string;
    duration?: number;
    nextFollowUp?: {
      scheduled_at: string;
      channel: FollowUpChannel;
      title?: string;
      notes?: string;
    };
  }) => {
    const nowIso = new Date().toISOString();
    const lead = leadsList.find((l) => l.id === data.leadId);

    let firstContactIso = lead?.first_contacted_at;
    let frtSeconds = lead?.first_response_time_seconds;
    let isBreached = lead?.is_first_response_breached;

    if (!firstContactIso && lead?.assigned_at) {
      firstContactIso = nowIso;
      const assignedTime = new Date(lead.assigned_at).getTime();
      const diffSeconds = Math.max(0, Math.floor((Date.now() - assignedTime) / 1000));
      frtSeconds = diffSeconds;
      isBreached = diffSeconds > sla.frt_minutes * 60;
    }

    const newStage = lead?.stage === 'new' ? 'contacted' : lead?.stage || 'contacted';

    setLeadsList((prev) =>
      prev.map((l) => {
        if (l.id === data.leadId) {
          return {
            ...l,
            stage: newStage,
            first_contacted_at: firstContactIso || l.first_contacted_at,
            first_response_time_seconds: frtSeconds ?? l.first_response_time_seconds,
            is_first_response_breached: isBreached ?? l.is_first_response_breached,
            last_contacted_at: nowIso,
            last_activity_type: data.type,
            next_follow_up_at: data.nextFollowUp ? data.nextFollowUp.scheduled_at : l.next_follow_up_at,
            updated_at: nowIso,
          };
        }
        return l;
      })
    );

    const newAct: ActivityLog = {
      id: `act-${Date.now()}`,
      lead_id: data.leadId,
      agent_id: currentUser.id,
      activity_type: data.type,
      title: data.title,
      outcome: data.outcome,
      notes: data.notes,
      call_duration_seconds: data.duration,
      created_at: nowIso,
    };
    setActivitiesList((prev) => [newAct, ...prev]);

    if (data.nextFollowUp) {
      const newFu: FollowUp = {
        id: `fu-${Date.now()}`,
        lead_id: data.leadId,
        assigned_to: currentUser.id,
        title: data.nextFollowUp.title || `Follow-up on ${lead?.destination || 'Inquiry'}`,
        scheduled_at: data.nextFollowUp.scheduled_at,
        channel: data.nextFollowUp.channel,
        priority: 'high',
        status: 'pending',
        notes: data.nextFollowUp.notes || data.notes,
        created_at: nowIso,
      };
      setFollowUpsList((prev) => [newFu, ...prev]);
    }
  };

  const completeFollowUp = (followUpId: string, completionNotes?: string) => {
    const nowIso = new Date().toISOString();
    setFollowUpsList((prev) =>
      prev.map((fu) => {
        if (fu.id === followUpId) {
          return {
            ...fu,
            status: 'completed',
            completion_notes: completionNotes || 'Completed',
            completed_at: nowIso,
            updated_at: nowIso,
          };
        }
        return fu;
      })
    );
  };

  const createFollowUp = (data: Partial<FollowUp>) => {
    const nowIso = new Date().toISOString();
    const newFu: FollowUp = {
      id: `fu-${Date.now()}`,
      lead_id: data.lead_id || '',
      assigned_to: data.assigned_to || currentUser.id,
      title: data.title || 'Scheduled Follow-up',
      scheduled_at: data.scheduled_at || new Date(Date.now() + 86400000).toISOString(),
      channel: data.channel || 'call',
      priority: data.priority || 'normal',
      status: 'pending',
      notes: data.notes || '',
      created_at: nowIso,
    };
    setFollowUpsList((prev) => [newFu, ...prev]);
  };

  const markNotificationAsRead = (id: string) => {
    setNotificationsList((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllNotificationsAsRead = () => {
    setNotificationsList((prev) =>
      prev.map((n) => (n.user_id === currentUser.id ? { ...n, is_read: true } : n))
    );
  };

  const updateAgencySettings = (newSettings: Partial<AgencySettings>) => {
    setSla((prev) => {
      const updated = { ...prev, ...newSettings };
      if (newSettings.currency) {
        const symbols: Record<CurrencyCode, string> = {
          USD: '$',
          EUR: '€',
          GBP: '£',
          INR: '₹',
          AUD: 'A$',
          AED: 'AED ',
        };
        updated.currency_symbol = symbols[newSettings.currency] || '$';
      }
      return updated;
    });
  };

  const updateSlaSettings = (newSettings: Partial<AgencySettings>) => {
    updateAgencySettings(newSettings);
  };

  const updateUserPreferences = (profileId: string, prefs: Partial<UserPreferences>) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id === profileId) {
          const defaultPrefs: UserPreferences = {
            idle_auto_away_minutes: 15,
            default_landing_page: '/leads',
            kanban_density: 'expanded',
            instant_whatsapp_direct: false,
            default_country_code: '+1',
          };
          return {
            ...p,
            user_preferences: {
              ...(p.user_preferences || defaultPrefs),
              ...prefs,
            },
          };
        }
        return p;
      })
    );
  };

  const updateTemplates = (newTemplates: WhatsAppTemplate[]) => {
    setTemplatesList(newTemplates);
  };

  const updateProfile = (profileId: string, updates: Partial<Profile>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, ...updates } : p))
    );
  };

  const createProfile = (data: Omit<Profile, 'id' | 'created_at' | 'current_load'>): Profile => {
    const newProfile: Profile = {
      ...data,
      id: `agent-${Date.now()}`,
      employee_code: data.employee_code || `TRV-EMP-${String(profiles.length + 1).padStart(3, '0')}`,
      current_load: 0,
      created_at: new Date().toISOString(),
    };
    setProfiles((prev) => [...prev, newProfile]);
    return newProfile;
  };

  const toggleAgentAcceptingLeads = (profileId: string) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, accepting_leads: !p.accepting_leads } : p))
    );
  };

  const bulkReassignAgentLeads = (fromAgentId: string, toAgentId: string): number => {
    const targetAgent = profiles.find((p) => p.id === toAgentId);
    const sourceAgent = profiles.find((p) => p.id === fromAgentId);
    if (!targetAgent) return 0;

    let count = 0;
    const now = new Date().toISOString();

    setLeadsList((prevLeads) => {
      return prevLeads.map((lead) => {
        if (lead.assigned_to === fromAgentId && lead.stage !== 'won' && lead.stage !== 'lost') {
          count++;
          return {
            ...lead,
            assigned_to: toAgentId,
            assigned_at: now,
          };
        }
        return lead;
      });
    });

    setFollowUpsList((prevFu) =>
      prevFu.map((fu) => {
        if (fu.assigned_to === fromAgentId && fu.status === 'pending') {
          return { ...fu, assigned_to: toAgentId };
        }
        return fu;
      })
    );

    if (count > 0) {
      const newAct: ActivityLog = {
        id: `act-bulk-${Date.now()}`,
        lead_id: 'all',
        agent_id: currentUser.id,
        activity_type: 'reassignment',
        title: `Bulk Leads Offloaded (${count} leads)`,
        notes: `Reassigned ${count} active leads from ${sourceAgent?.full_name || 'Agent'} to ${targetAgent.full_name}.`,
        created_at: now,
      };
      setActivitiesList((prev) => [newAct, ...prev]);

      const newNotif: AppNotification = {
        id: `notif-bulk-${Date.now()}`,
        user_id: toAgentId,
        title: `Bulk Lead Ingestion: ${count} Leads Assigned`,
        message: `${count} active inquiries were transferred to your pipeline from ${sourceAgent?.full_name || 'teammate'}.`,
        type: 'lead_assigned',
        link: '/leads',
        is_read: false,
        created_at: now,
      };
      setNotificationsList((prev) => [newNotif, ...prev]);
    }

    return count;
  };

  const getAgentMetrics = (agentId: string) => {
    const agent = profiles.find((p) => p.id === agentId);
    const agentLeads = leadsList.filter((l) => l.assigned_to === agentId);
    const activeLeads = agentLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
    const wonLeads = agentLeads.filter((l) => l.stage === 'won');
    const lostLeads = agentLeads.filter((l) => l.stage === 'lost');
    const closedCount = wonLeads.length + lostLeads.length;
    const winRate = closedCount > 0 ? Math.round((wonLeads.length / closedCount) * 100) : 0;
    const revenue = wonLeads.reduce((sum, l) => sum + (l.package_sale_price || l.won_deal_value || 0), 0);
    const grossProfit = wonLeads.reduce((sum, l) => sum + (l.gross_profit || 0), 0);

    const leadsWithFrt = agentLeads.filter((l) => l.first_response_time_seconds != null);
    const avgFrtSeconds =
      leadsWithFrt.length > 0
        ? Math.round(
            leadsWithFrt.reduce((s, l) => s + (l.first_response_time_seconds || 0), 0) /
              leadsWithFrt.length
          )
        : 720;
    const avgFrtMinutes = Math.round(avgFrtSeconds / 60);
    const breaches = agentLeads.filter((l) => l.is_first_response_breached).length;
    const activityCount = activitiesList.filter((a) => a.agent_id === agentId).length;
    const maxCap = agent?.max_capacity || 25;
    const capacityPct = Math.min(100, Math.round((activeLeads.length / maxCap) * 100));

    return {
      totalAssigned: agentLeads.length,
      activeLeads: activeLeads.length,
      wonCount: wonLeads.length,
      lostCount: lostLeads.length,
      winRate,
      revenue,
      grossProfit,
      avgFrtMinutes,
      breaches,
      activityCount,
      capacityPct,
    };
  };

  const resetToFactoryDefaults = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('wanderlust_crm_v1');
      }
    } catch {}
    setProfiles(INITIAL_PROFILES);
    setCurrentUserId(INITIAL_PROFILES[0].id);
    setLeadsList(INITIAL_LEADS);
    setFollowUpsList(INITIAL_FOLLOW_UPS);
    setActivitiesList(INITIAL_ACTIVITIES);
    setTemplatesList(INITIAL_TEMPLATES);
    setSla(INITIAL_SLA);
    setNotificationsList(INITIAL_NOTIFICATIONS);
    setTiers(INITIAL_INCENTIVE_TIERS);
  };

  const exportCrmBackup = () => {
    if (typeof window === 'undefined') return;
    const backup = {
      app: 'Wanderlust Travel CRM',
      version: 1,
      exported_at: new Date().toISOString(),
      data: {
        profiles,
        currentUserId,
        leadsList,
        followUpsList,
        activitiesList,
        templatesList,
        sla,
        notificationsList,
        tiers,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wanderlust_crm_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCrmBackup = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      const data = parsed.data || parsed;
      if (data.profiles && Array.isArray(data.profiles)) setProfiles(data.profiles);
      if (data.currentUserId && typeof data.currentUserId === 'string') setCurrentUserId(data.currentUserId);
      if (data.leadsList && Array.isArray(data.leadsList)) setLeadsList(data.leadsList);
      if (data.followUpsList && Array.isArray(data.followUpsList)) setFollowUpsList(data.followUpsList);
      if (data.activitiesList && Array.isArray(data.activitiesList)) setActivitiesList(data.activitiesList);
      if (data.templatesList && Array.isArray(data.templatesList)) setTemplatesList(data.templatesList);
      if (data.sla && typeof data.sla === 'object') setSla(data.sla);
      if (data.notificationsList && Array.isArray(data.notificationsList)) setNotificationsList(data.notificationsList);
      if (data.tiers && Array.isArray(data.tiers)) setTiers(data.tiers);
      return true;
    } catch (e) {
      console.error('Failed to import CRM backup:', e);
      return false;
    }
  };

  const createLeadQuotation = (leadId: string, quoteData: Partial<LeadQuotation>): LeadQuotation => {
    const quoteNum = `QT-${Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();
    const newQuote: LeadQuotation = {
      id: `quote-${Date.now()}`,
      lead_id: leadId,
      quote_number: quoteNum,
      package_title: quoteData.package_title || 'Custom Travel Package',
      destination: quoteData.destination || 'Bali',
      duration_days: quoteData.duration_days || 5,
      travel_dates: quoteData.travel_dates || '',
      pax_summary: quoteData.pax_summary || '2 Adults',
      hotel_category: quoteData.hotel_category || '4-star',
      line_items: quoteData.line_items || [],
      total_selling_price: quoteData.total_selling_price || 0,
      total_supplier_cost: quoteData.total_supplier_cost || 0,
      gross_profit: quoteData.gross_profit || 0,
      profit_margin_pct: quoteData.profit_margin_pct || 0,
      commission_earned: quoteData.commission_earned || 0,
      inclusions: quoteData.inclusions || [],
      exclusions: quoteData.exclusions || [],
      validity_days: quoteData.validity_days || 7,
      status: quoteData.status || 'sent',
      created_at: nowIso,
    };

    setLeadsList((prev) =>
      prev.map((lead) => {
        if (lead.id !== leadId) return lead;
        const quotes = lead.quotes ? [newQuote, ...lead.quotes] : [newQuote];
        return {
          ...lead,
          package_sale_price: newQuote.total_selling_price,
          vendor_net_cost: newQuote.total_supplier_cost,
          gross_profit: newQuote.gross_profit,
          profit_margin_pct: newQuote.profit_margin_pct,
          agent_commission_earned: newQuote.commission_earned,
          stage: 'quote_sent',
          last_activity_type: 'quote',
          last_contacted_at: nowIso,
          quotes,
          latest_quote: newQuote,
          updated_at: nowIso,
        };
      })
    );

    logActivity({
      leadId,
      type: 'quote',
      title: `Quotation Generated (${quoteNum})`,
      notes: `Sent quote for ${newQuote.package_title}: ${formatCurrency(newQuote.total_selling_price)} (${newQuote.profit_margin_pct}% margin, ${formatCurrency(newQuote.gross_profit)} gross profit).`,
    });

    return newQuote;
  };

  const bulkAssignLeads = (leadIds: string[], agentId: string) => {
    const targetAgent = profiles.find((p) => p.id === agentId);
    if (!targetAgent || leadIds.length === 0) return;
    const nowIso = new Date().toISOString();

    setLeadsList((prev) =>
      prev.map((l) => {
        if (!leadIds.includes(l.id)) return l;
        return {
          ...l,
          assigned_to: agentId,
          assigned_at: nowIso,
          updated_at: nowIso,
        };
      })
    );

    leadIds.forEach((leadId) => {
      logActivity({
        leadId,
        type: 'reassignment',
        title: `Bulk Reassigned to ${targetAgent.full_name}`,
        notes: `Lead was transferred in a batch reassignment operation.`,
      });
    });

    const newNotif: AppNotification = {
      id: `notif-bulk-${Date.now()}`,
      user_id: agentId,
      title: `${leadIds.length} Leads Assigned`,
      message: `${leadIds.length} leads were transferred to you in a batch operation.`,
      type: 'lead_assigned',
      link: '/leads',
      is_read: false,
      created_at: nowIso,
    };
    setNotificationsList((prev) => [newNotif, ...prev]);
  };

  const bulkUpdateLeadStage = (leadIds: string[], stage: LeadStage) => {
    if (leadIds.length === 0) return;
    const nowIso = new Date().toISOString();

    setLeadsList((prev) =>
      prev.map((l) => {
        if (!leadIds.includes(l.id)) return l;
        return {
          ...l,
          stage,
          updated_at: nowIso,
        };
      })
    );

    leadIds.forEach((leadId) => {
      logActivity({
        leadId,
        type: 'stage_change',
        title: `Stage Changed to ${stage.toUpperCase().replace('_', ' ')}`,
        notes: `Bulk status update applied across selection.`,
      });
    });
  };

  // Operational & Lifecycle Implementations
  const addPaymentRecord = (
    leadId: string,
    payment: {
      amount: number;
      method: PaymentMethod;
      reference_no?: string;
      notes?: string;
    }
  ): PaymentRecord => {
    const nowIso = new Date().toISOString();
    const receiptNum = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRecord: PaymentRecord = {
      id: `pay-${Date.now()}`,
      lead_id: leadId,
      receipt_number: receiptNum,
      amount: payment.amount,
      method: payment.method,
      reference_no: payment.reference_no,
      notes: payment.notes,
      received_at: nowIso,
      created_at: nowIso,
    };

    setLeadsList((prev) =>
      prev.map((lead) => {
        if (lead.id !== leadId) return lead;
        const currentRecords = lead.payment_records || [];
        const updatedRecords = [newRecord, ...currentRecords];

        let remainingPaid = updatedRecords.reduce((sum, r) => sum + r.amount, 0);
        const updatedMilestones = (lead.payment_milestones || []).map((m) => {
          if (remainingPaid >= m.amount) {
            remainingPaid -= m.amount;
            return { ...m, status: 'paid' as const, paid_amount: m.amount, paid_at: m.paid_at || nowIso };
          } else if (remainingPaid > 0) {
            const partial = remainingPaid;
            remainingPaid = 0;
            return { ...m, paid_amount: partial, status: 'pending' as const };
          }
          return { ...m, paid_amount: 0, status: 'pending' as const };
        });

        return {
          ...lead,
          payment_records: updatedRecords,
          payment_milestones: updatedMilestones,
          updated_at: nowIso,
        };
      })
    );

    logActivity({
      leadId,
      type: 'payment',
      title: `Payment Received (${formatCurrency(payment.amount)})`,
      notes: `Receipt #${receiptNum} recorded via ${payment.method.replace('_', ' ').toUpperCase()}${
        payment.reference_no ? ` (Ref: ${payment.reference_no})` : ''
      }.`,
    });

    return newRecord;
  };

  const updatePaymentMilestones = (leadId: string, milestones: PaymentMilestone[]) => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, payment_milestones: milestones, updated_at: nowIso } : l))
    );
  };

  const updateItineraryDays = (leadId: string, days: ItineraryDay[]) => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, itinerary_days: days, updated_at: nowIso } : l))
    );
    logActivity({
      leadId,
      type: 'system',
      title: 'Itinerary Schedule Updated',
      notes: `${days.length}-day travel schedule was revised.`,
    });
  };

  const checkPassportValidity = (expiryDate?: string): boolean => {
    if (!expiryDate) return true;
    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime())) return true;
    const baseDate = new Date();
    const minValidDate = new Date(baseDate.getTime() + 180 * 24 * 60 * 60 * 1000);
    return expiry > minValidDate;
  };

  const addPassenger = (
    leadId: string,
    passenger: Omit<TravelerPassenger, 'id' | 'lead_id'>
  ): TravelerPassenger => {
    const valid6m = checkPassportValidity(passenger.passport_expiry_date);
    const newPax: TravelerPassenger = {
      ...passenger,
      id: `pax-${Date.now()}`,
      lead_id: leadId,
      is_passport_valid_6months: valid6m,
    };

    setLeadsList((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              passengers: [...(l.passengers || []), newPax],
              updated_at: new Date().toISOString(),
            }
          : l
      )
    );

    logActivity({
      leadId,
      type: 'document',
      title: `Passenger Added: ${newPax.full_name}`,
      notes: `${newPax.type.toUpperCase()} • Passport: ${newPax.passport_number || 'Pending'} (${
        valid6m ? 'Valid >6M' : 'ALERT: Expires <6M'
      })`,
    });

    return newPax;
  };

  const updatePassenger = (
    leadId: string,
    passengerId: string,
    updates: Partial<TravelerPassenger>
  ) => {
    setLeadsList((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const updatedPax = (l.passengers || []).map((p) => {
          if (p.id !== passengerId) return p;
          const merged = { ...p, ...updates };
          if (updates.passport_expiry_date) {
            merged.is_passport_valid_6months = checkPassportValidity(updates.passport_expiry_date);
          }
          return merged;
        });
        return { ...l, passengers: updatedPax, updated_at: new Date().toISOString() };
      })
    );
  };

  const deletePassenger = (leadId: string, passengerId: string) => {
    setLeadsList((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          passengers: (l.passengers || []).filter((p) => p.id !== passengerId),
          updated_at: new Date().toISOString(),
        };
      })
    );
  };

  const addDocument = (
    leadId: string,
    document: Omit<TravelerDocument, 'id' | 'lead_id' | 'uploaded_at'>
  ): TravelerDocument => {
    const nowIso = new Date().toISOString();
    const newDoc: TravelerDocument = {
      ...document,
      id: `doc-${Date.now()}`,
      lead_id: leadId,
      uploaded_at: nowIso,
    };

    setLeadsList((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              documents: [newDoc, ...(l.documents || [])],
              updated_at: nowIso,
            }
          : l
      )
    );

    logActivity({
      leadId,
      type: 'document',
      title: `Document Uploaded: ${newDoc.title}`,
      notes: `Category: ${newDoc.category.toUpperCase().replace('_', ' ')} (${newDoc.file_name})`,
    });

    return newDoc;
  };

  const deleteDocument = (leadId: string, documentId: string) => {
    setLeadsList((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          documents: (l.documents || []).filter((d) => d.id !== documentId),
          updated_at: new Date().toISOString(),
        };
      })
    );
  };

  const updateSupplierPayables = (leadId: string, payables: LeadSupplierPayable[]) => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, supplier_payables: payables, updated_at: nowIso } : l))
    );
  };

  const updatePreDepartureChecklist = (leadId: string, checklist: Partial<PreDepartureChecklist>) => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) => {
        if (l.id !== leadId) return l;
        const current = l.checklist || {
          flights_ticketed: false,
          hotel_vouchers_issued: false,
          passports_verified_6months: false,
          visas_confirmed: false,
          travel_insurance_issued: false,
          web_checkin_completed: false,
          emergency_contacts_dispatched: false,
        };
        const updated = { ...current, ...checklist };
        const allDone = Object.values(updated).every(Boolean);
        const newTripStatus = allDone && l.trip_status === 'planning' ? 'pre_departure' : l.trip_status;

        return {
          ...l,
          checklist: updated,
          trip_status: newTripStatus,
          updated_at: nowIso,
        };
      })
    );
  };

  const recordPostTripReview = (leadId: string, review: PostTripReview) => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              post_trip_review: { ...review, reviewed_at: nowIso },
              trip_status: 'completed',
              updated_at: nowIso,
            }
          : l
      )
    );

    logActivity({
      leadId,
      type: 'system',
      title: `Trip Review Logged: ${review.rating}★ (NPS: ${review.nps_score}/10)`,
      notes: review.feedback_notes || 'Customer post-travel review recorded.',
    });
  };

  const updateTripStatus = (leadId: string, status: TripLifecycleStatus) => {
    const nowIso = new Date().toISOString();
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, trip_status: status, updated_at: nowIso } : l))
    );
    logActivity({
      leadId,
      type: 'stage_change',
      title: `Trip Status: ${status.toUpperCase().replace('_', ' ')}`,
      notes: `Trip lifecycle progressed to ${status.replace('_', ' ')}.`,
    });
  };

  const executeFollowUpDisposition = (
    leadId: string,
    followUpId: string,
    disposition: FollowUpDisposition
  ) => {
    const lead = leadsList.find((l) => l.id === leadId);
    const existingFu = followUpsList.find((f) => f.id === followUpId);
    const nowIso = new Date().toISOString();

    let completionNotes = disposition.notes || '';
    let nextFollowUpScheduledAt: string | undefined = disposition.callback_at;
    let nextChannel: FollowUpChannel = 'call';
    let nextTitle = 'Follow-up Call';

    if (disposition.outcome === 'no_answer') {
      completionNotes = completionNotes
        ? `No Answer: ${completionNotes}`
        : 'Customer did not answer call / line busy';
      if (!nextFollowUpScheduledAt) {
        nextFollowUpScheduledAt = new Date(Date.now() + 3 * 3600000).toISOString();
      }
      nextTitle = 'Retry Callback (No Answer earlier)';
      nextChannel = 'call';
    } else if (disposition.outcome === 'engaged_interested') {
      completionNotes = completionNotes
        ? `Engaged & Interested: ${completionNotes}`
        : 'Spoke with traveler. Very interested in package proposal.';
      if (!nextFollowUpScheduledAt) {
        nextFollowUpScheduledAt = new Date(Date.now() + 2 * 86400000).toISOString();
      }
      nextTitle = 'Review Quotation & Room Availability';
      nextChannel = 'call';
    } else if (disposition.outcome === 'quote_revision') {
      completionNotes = completionNotes
        ? `Quote Revision Requested: ${completionNotes}`
        : 'Traveler requested changes to hotel/flights/dates';
      if (!nextFollowUpScheduledAt) {
        nextFollowUpScheduledAt = new Date(Date.now() + 24 * 3600000).toISOString();
      }
      nextTitle = 'Send Revised Itinerary & Costing';
      nextChannel = 'whatsapp';
      if (lead && (lead.stage === 'quote_sent' || lead.stage === 'contacted')) {
        updateLeadStage(leadId, 'in_negotiation');
      }
    } else if (disposition.outcome === 'snooze') {
      completionNotes = completionNotes
        ? `Snoozed: ${completionNotes}`
        : 'Follow-up snoozed per customer request';
      nextTitle = 'Scheduled Check-in';
      nextChannel = existingFu?.channel || 'call';
    } else if (disposition.outcome === 'lost') {
      completionNotes = completionNotes
        ? `Inquiry Dropped / Lost: ${completionNotes}`
        : 'Customer decided not to proceed';
      if (lead) {
        updateLeadStage(leadId, 'lost');
      }
    } else {
      completionNotes = completionNotes || 'Follow-up task completed successfully';
    }

    // 1. Mark existing follow up completed
    setFollowUpsList((prev) =>
      prev.map((f) =>
        f.id === followUpId
          ? {
              ...f,
              status: 'completed',
              disposition: disposition.outcome,
              completion_notes: completionNotes,
              completed_at: nowIso,
            }
          : f
      )
    );

    // 2. Schedule next follow-up if applicable
    if (nextFollowUpScheduledAt && disposition.outcome !== 'lost' && disposition.outcome !== 'completed') {
      const newFuId = `fu-${Date.now()}`;
      const newFollowUp: FollowUp = {
        id: newFuId,
        lead_id: leadId,
        assigned_to: existingFu?.assigned_to || lead?.assigned_to || currentUser.id,
        title: nextTitle,
        scheduled_at: nextFollowUpScheduledAt,
        channel: nextChannel,
        status: 'pending',
        notes: completionNotes,
        created_at: nowIso,
        retry_count: (existingFu?.retry_count || 0) + (disposition.outcome === 'no_answer' ? 1 : 0),
        rescheduled_from_id: followUpId,
      };

      setFollowUpsList((prev) => [newFollowUp, ...prev]);

      setLeadsList((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                next_follow_up_at: nextFollowUpScheduledAt,
                last_contacted_at: nowIso,
                last_activity_type: 'call',
              }
            : l
        )
      );
    } else {
      setLeadsList((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                last_contacted_at: nowIso,
                last_activity_type: 'call',
              }
            : l
        )
      );
    }

    // 3. Log Activity Timeline
    const actId = `act-${Date.now()}`;
    const newActivity: ActivityLog = {
      id: actId,
      lead_id: leadId,
      agent_id: currentUser.id,
      activity_type: 'call',
      title: `Follow-up: ${disposition.outcome.replace('_', ' ').toUpperCase()}`,
      outcome: disposition.outcome,
      notes: completionNotes,
      created_at: nowIso,
    };
    setActivitiesList((prev) => [newActivity, ...prev]);
  };

  const getAgentHealthScore = (agentId: string): EmployeeHealthScore => {
    const profile = profiles.find((p) => p.id === agentId);
    const agentLeads = leadsList.filter((l) => l.assigned_to === agentId);
    const agentFollowUps = followUpsList.filter((f) => f.assigned_to === agentId);
    const agentActivities = activitiesList.filter((a) => a.agent_id === agentId);

    const now = Date.now();
    const activeLeads = agentLeads.filter((l) => l.stage !== 'won' && l.stage !== 'lost');
    const wonLeads = agentLeads.filter((l) => l.stage === 'won');
    const lostLeads = agentLeads.filter((l) => l.stage === 'lost');

    // 1. SLA Compliance Score (0-100)
    const breachedCount = agentLeads.filter((l) => l.is_first_response_breached).length;
    const leadsWithFrt = agentLeads.filter((l) => l.first_response_time_seconds != null);
    const avgFrtMins = leadsWithFrt.length > 0
      ? Math.round(leadsWithFrt.reduce((s, l) => s + (l.first_response_time_seconds || 0), 0) / leadsWithFrt.length / 60)
      : 12;
    
    let slaScore = 100 - (breachedCount * 25);
    if (avgFrtMins > 30) slaScore -= 20;
    else if (avgFrtMins > 15) slaScore -= 10;
    slaScore = Math.min(100, Math.max(0, slaScore));

    // 2. Follow-Up Discipline Score (0-100)
    const overdueTasks = agentFollowUps.filter(
      (f) => f.status !== 'completed' && new Date(f.scheduled_at).getTime() < now
    );
    const completedTasks = agentFollowUps.filter((f) => f.status === 'completed');
    const totalScheduled = completedTasks.length + overdueTasks.length;
    const onTimeFollowupPct = totalScheduled > 0
      ? Math.round((completedTasks.length / totalScheduled) * 100)
      : 100;
    
    let followupScore = onTimeFollowupPct - (overdueTasks.length * 12);
    followupScore = Math.min(100, Math.max(0, followupScore));

    // 3. Conversion Velocity Score (0-100)
    const closedCount = wonLeads.length + lostLeads.length;
    const winRate = closedCount > 0 ? wonLeads.length / closedCount : 0.4;
    const activeQuotingCount = agentLeads.filter((l) => l.stage === 'quote_sent' || l.stage === 'in_negotiation').length;
    let conversionScore = Math.round((winRate * 60) + Math.min(40, activeQuotingCount * 8));
    conversionScore = Math.min(100, Math.max(20, conversionScore));

    // 4. Workload Balance & Capacity Stress Score (0-100)
    const maxCap = profile?.max_capacity || 25;
    const capacityPct = Math.round((activeLeads.length / maxCap) * 100);
    let workloadScore = 100;
    if (capacityPct > 100) workloadScore = 35;
    else if (capacityPct > 85) workloadScore = 60;
    else if (capacityPct < 20) workloadScore = 75;
    else workloadScore = 95;

    // 5. Overall Weighted Index
    const overallScore = Math.round(
      0.30 * slaScore +
      0.30 * followupScore +
      0.25 * conversionScore +
      0.15 * workloadScore
    );

    let grade: 'elite' | 'healthy' | 'attention_needed' | 'burnout_risk' = 'healthy';
    if (overallScore >= 85) grade = 'elite';
    else if (overallScore >= 70) grade = 'healthy';
    else if (overallScore >= 50) grade = 'attention_needed';
    else grade = 'burnout_risk';

    // 6. Automated Smart Recommendations
    const recommendations: string[] = [];
    if (overdueTasks.length > 0) {
      recommendations.push(`Clear ${overdueTasks.length} overdue follow-up callback${overdueTasks.length > 1 ? 's' : ''} to prevent traveler drop-off.`);
    }
    if (capacityPct > 85) {
      recommendations.push(`Workload is at ${capacityPct}% capacity. Reassign 3-5 aging inquiries to relieve stress.`);
    }
    if (breachedCount > 0) {
      recommendations.push(`${breachedCount} inbound lead${breachedCount > 1 ? 's' : ''} breached First Response SLA. Prioritize newly assigned inquiries.`);
    }
    if (avgFrtMins > 25) {
      recommendations.push(`Average response time is ${avgFrtMins}m (target: <15m). Enable desktop notifications.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('High operational efficiency! On-time follow-ups and optimal pipeline load.');
    }

    // 7. Last Active Timestamp
    const lastActivity = agentActivities[0];
    const lastActiveAt = lastActivity?.created_at || profile?.created_at;

    return {
      agent_id: agentId,
      overall_score: overallScore,
      grade,
      sla_score: slaScore,
      followup_score: followupScore,
      conversion_score: conversionScore,
      workload_score: workloadScore,
      avg_frt_minutes: avgFrtMins,
      on_time_followup_pct: onTimeFollowupPct,
      active_leads_count: activeLeads.length,
      overdue_tasks_count: overdueTasks.length,
      capacity_pct: capacityPct,
      last_active_at: lastActiveAt,
      recommendations,
    };
  };

  const rebalanceOverdueFollowUps = (fromAgentId: string, toAgentId?: string): number => {
    const now = Date.now();
    const overdueTasks = followUpsList.filter(
      (f) => f.assigned_to === fromAgentId && f.status !== 'completed' && new Date(f.scheduled_at).getTime() < now
    );

    if (overdueTasks.length === 0) return 0;

    let targetId = toAgentId;
    if (!targetId) {
      const candidates = profiles
        .filter((p) => p.id !== fromAgentId && p.is_active && p.accepting_leads && p.status === 'available')
        .map((p) => {
          const load = leadsList.filter((l) => l.assigned_to === p.id && l.stage !== 'won' && l.stage !== 'lost').length;
          const pct = (load / (p.max_capacity || 25)) * 100;
          return { id: p.id, pct };
        })
        .sort((a, b) => a.pct - b.pct);

      targetId = candidates[0]?.id || profiles.find((p) => p.id !== fromAgentId)?.id;
    }

    if (!targetId) return 0;

    const targetAgent = profiles.find((p) => p.id === targetId);
    const fromAgent = profiles.find((p) => p.id === fromAgentId);
    const nowIso = new Date().toISOString();
    const overdueLeadIds = Array.from(new Set(overdueTasks.map((t) => t.lead_id)));

    setFollowUpsList((prev) =>
      prev.map((f) =>
        f.assigned_to === fromAgentId && f.status !== 'completed' && new Date(f.scheduled_at).getTime() < now
          ? { ...f, assigned_to: targetId, notes: `${f.notes || ''} [Rebalanced from ${fromAgent?.full_name || 'agent'}]` }
          : f
      )
    );

    setLeadsList((prev) =>
      prev.map((l) =>
        overdueLeadIds.includes(l.id)
          ? {
              ...l,
              assigned_to: targetId,
              assigned_at: nowIso,
              updated_at: nowIso,
            }
          : l
      )
    );

    overdueLeadIds.forEach((lid) => {
      const actId = `act-rebalance-${Date.now()}-${lid.slice(0, 4)}`;
      setActivitiesList((prev) => [
        {
          id: actId,
          lead_id: lid,
          agent_id: currentUser.id,
          activity_type: 'reassignment',
          title: `Overdue Follow-up Rebalanced`,
          outcome: 'Reassigned',
          notes: `Lead rebalanced from ${fromAgent?.full_name} to ${targetAgent?.full_name} due to overdue callback SLA.`,
          created_at: nowIso,
        },
        ...prev,
      ]);
    });

    return overdueTasks.length;
  };

  const exportFollowUpsIcal = (tasks?: FollowUp[]) => {
    const list = tasks || followUpsList.filter((f) => f.status !== 'completed');
    if (typeof window === 'undefined') return;

    const formatIcalDate = (isoStr: string) => {
      const d = new Date(isoStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Wanderlust CRM//Follow-up Agenda//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    list.forEach((t) => {
      const lead = leadsList.find((l) => l.id === t.lead_id);
      const dtStart = formatIcalDate(t.scheduled_at);
      const dtEnd = formatIcalDate(new Date(new Date(t.scheduled_at).getTime() + 30 * 60000).toISOString());
      const summary = `CRM: ${t.title}${lead ? ` - ${lead.customer_name} (${lead.destination})` : ''}`;
      const description = `Customer: ${lead?.customer_name || 'N/A'}\\nPhone: ${lead?.customer_phone || 'N/A'}\\nChannel: ${t.channel.toUpperCase()}\\nNotes: ${t.notes || 'None'}`;

      icsContent.push(
        'BEGIN:VEVENT',
        `UID:wanderlust-${t.id}@travellms.com`,
        `DTSTAMP:${formatIcalDate(new Date().toISOString())}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wanderlust_agenda_${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const profilesWithDynamicLoad = profiles.map((p) => {
    const activeCount = leadsList.filter(
      (l) => l.assigned_to === p.id && l.stage !== 'won' && l.stage !== 'lost'
    ).length;
    return { ...p, current_load: activeCount };
  });

  return (
    <AppContext.Provider
      value={{
        currentUser,
        allProfiles: profilesWithDynamicLoad,
        leads: visibleLeads,
        allLeads: leadsList,
        followUps: followUpsList,
        activities: activitiesList,
        templates: templatesList,
        slaSettings: sla,
        agencySettings: sla,
        notifications: userNotifications,
        unreadCount,
        incentiveTiers: tiers,
        isAuthenticated,
        login,
        logout,
        switchUser,
        updateAgentStatus,
        addLead,
        updateLeadStage,
        assignLead,
        logActivity,
        completeFollowUp,
        createFollowUp,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        updateSlaSettings,
        updateAgencySettings,
        updateUserPreferences,
        updateTemplates,
        updateIncentiveTiers,
        approveCommissionPayout,
        getAgentIncentiveProfile,
        updateProfile,
        createProfile,
        toggleAgentAcceptingLeads,
        bulkReassignAgentLeads,
        getAgentMetrics,
        playNotificationSound,
        formatCurrency,
        formatAppDate,
        isHydrated,
        resetToFactoryDefaults,
        exportCrmBackup,
        importCrmBackup,
        createLeadQuotation,
        bulkAssignLeads,
        bulkUpdateLeadStage,
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
        executeFollowUpDisposition,
        getAgentHealthScore,
        rebalanceOverdueFollowUps,
        exportFollowUpsIcal,
        toast,
        showToast,
        hideToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}

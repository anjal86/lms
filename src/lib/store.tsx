'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from './supabase/client';
import type {
  ActivityLog,
  ActivityType,
  AgencySettings,
  AgentStatus,
  AppNotification,
  CommissionStatus,
  CurrencyCode,
  EmployeeHealthScore,
  FollowUp,
  FollowUpChannel,
  FollowUpDisposition,
  IncentiveTier,
  ItineraryDay,
  Lead,
  LeadQuotation,
  LeadStage,
  LeadSupplierPayable,
  PaymentMethod,
  PaymentMilestone,
  PaymentRecord,
  PostTripReview,
  PreDepartureChecklist,
  Profile,
  SoundPreset,
  TravelerDocument,
  TravelerPassenger,
  TripLifecycleStatus,
  UserPreferences,
} from './types';

const DEFAULT_SETTINGS: AgencySettings = {
  id: 'default',
  frt_minutes: 30,
  overdue_grace_minutes: 60,
  escalate_to_manager: true,
  auto_reassign_breached_leads: false,
  auto_reassign_hours: 4,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  freeze_sla_weekends: true,
  timezone: 'Asia/Kathmandu',
  pre_breach_warning_minutes: 10,
  routing_strategy: 'workload_balanced',
  routing_overflow_policy: 'unassigned_pool',
  vip_high_budget_threshold: 8000,
  vip_route_seniors_only: true,
  lead_cooldown_minutes: 3,
  currency: 'USD',
  currency_symbol: '$',
  date_format: 'DD/MM/YYYY',
  commission_tds_pct: 10,
  min_gross_margin_threshold: 12,
  payout_frequency: 'monthly',
  notification_sound_enabled: true,
  notification_sound_preset: 'chime',
  notification_volume: 75,
  mute_sound_in_call: true,
  browser_push_enabled: false,
  toast_duration_seconds: 3,
  custom_lost_reasons: ['budget_too_high', 'competitor', 'dates_changed', 'no_response', 'other'],
  custom_lead_sources: ['website', 'meta_ads', 'google_ads', 'whatsapp', 'referral', 'walk_in', 'phone_call', 'other'],
  auto_archive_days: 30,
};

const EMPTY_PROFILE: Profile = {
  id: '',
  email: '',
  full_name: 'Loading…',
  role: 'agent',
  destination_tags: [],
  max_capacity: 25,
  current_load: 0,
  status: 'offline',
  is_active: false,
  accepting_leads: false,
  languages: [],
  certifications: [],
  created_at: new Date(0).toISOString(),
};

type Toast = { message: string; type?: 'success' | 'info' | 'warning' | 'error'; id: number } | null;

interface AppContextType {
  currentUser: Profile;
  allProfiles: Profile[];
  leads: Lead[];
  allLeads: Lead[];
  followUps: FollowUp[];
  activities: ActivityLog[];
  templates: any[];
  slaSettings: AgencySettings;
  agencySettings: AgencySettings;
  notifications: AppNotification[];
  unreadCount: number;
  incentiveTiers: IncentiveTier[];
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchUser: (profileId: string) => void;
  updateAgentStatus: (status: AgentStatus) => void;
  addLead: (lead: Partial<Lead>) => Lead;
  updateLeadStage: (leadId: string, stage: LeadStage, lostReason?: string, lostNotes?: string, financials?: { packageSalePrice: number; vendorNetCost: number }) => void;
  assignLead: (leadId: string, agentId: string) => void;
  logActivity: (data: { leadId: string; type: ActivityType; title: string; outcome?: string; notes?: string; duration?: number; nextFollowUp?: { scheduled_at: string; channel: FollowUpChannel; title?: string; notes?: string } }) => void;
  completeFollowUp: (followUpId: string, completionNotes?: string) => void;
  createFollowUp: (data: Partial<FollowUp>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  updateSlaSettings: (settings: Partial<AgencySettings>) => void;
  updateAgencySettings: (settings: Partial<AgencySettings>) => void;
  updateUserPreferences: (profileId: string, prefs: Partial<UserPreferences>) => void;
  updateTemplates: (templates: any[]) => void;
  updateIncentiveTiers: (tiers: IncentiveTier[]) => void;
  approveCommissionPayout: (leadId: string, newStatus?: CommissionStatus) => void;
  getAgentIncentiveProfile: (agentId: string) => { currentTier: IncentiveTier; nextTier: IncentiveTier | null; totalSales: number; totalGrossProfit: number; avgProfitMargin: number; accruedCommission: number; approvedCommission: number; paidCommission: number; salesToNextTier: number; progressPct: number; wonDealsCount: number };
  updateProfile: (profileId: string, updates: Partial<Profile>) => void;
  createProfile: (data: Omit<Profile, 'id' | 'created_at' | 'current_load'>) => Promise<Profile | null>;
  toggleAgentAcceptingLeads: (profileId: string) => void;
  bulkReassignAgentLeads: (fromAgentId: string, toAgentId: string) => number;
  getAgentMetrics: (agentId: string) => { totalAssigned: number; activeLeads: number; wonCount: number; lostCount: number; winRate: number; revenue: number; grossProfit: number; avgFrtMinutes: number; breaches: number; activityCount: number; capacityPct: number };
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
  addPaymentRecord: (leadId: string, payment: { amount: number; method: PaymentMethod; reference_no?: string; notes?: string }) => PaymentRecord;
  updatePaymentMilestones: (leadId: string, milestones: PaymentMilestone[]) => void;
  updateItineraryDays: (leadId: string, days: ItineraryDay[]) => void;
  addPassenger: (leadId: string, passenger: Omit<TravelerPassenger, 'id' | 'lead_id'>) => TravelerPassenger;
  updatePassenger: (leadId: string, passengerId: string, updates: Partial<TravelerPassenger>) => void;
  deletePassenger: (leadId: string, passengerId: string) => void;
  addDocument: (leadId: string, document: Omit<TravelerDocument, 'id' | 'lead_id' | 'uploaded_at'>) => TravelerDocument;
  deleteDocument: (leadId: string, documentId: string) => void;
  updatePreDepartureChecklist: (leadId: string, checklist: Partial<PreDepartureChecklist>) => void;
  updateSupplierPayables: (leadId: string, payables: LeadSupplierPayable[]) => void;
  recordPostTripReview: (leadId: string, review: PostTripReview) => void;
  updateTripStatus: (leadId: string, status: TripLifecycleStatus) => void;
  executeFollowUpDisposition: (leadId: string, followUpId: string, disposition: FollowUpDisposition) => void;
  getAgentHealthScore: (agentId: string) => EmployeeHealthScore;
  rebalanceOverdueFollowUps: (fromAgentId: string, toAgentId?: string) => number;
  exportFollowUpsIcal: (tasks?: FollowUp[]) => void;
  toast: Toast;
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  hideToast: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const uuid = () => crypto.randomUUID();
const isManagement = (profile: Profile) => profile.role === 'admin' || profile.role === 'manager';
const toNumber = (value: unknown) => typeof value === 'number' ? value : Number(value || 0);
const normalizeLead = (row: any): Lead => {
  const quotes = Array.isArray(row.quotes) ? row.quotes : [];
  return { ...row, quotes, latest_quote: quotes[0] } as Lead;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [followUpsList, setFollowUpsList] = useState<FollowUp[]>([]);
  const [activitiesList, setActivitiesList] = useState<ActivityLog[]>([]);
  const [templatesList, setTemplatesList] = useState<any[]>([]);
  const [sla, setSla] = useState<AgencySettings>(DEFAULT_SETTINGS);
  const [notificationsList, setNotificationsList] = useState<AppNotification[]>([]);
  const [tiers, setTiers] = useState<IncentiveTier[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type, id: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), (sla.toast_duration_seconds || 3) * 1000);
  }, [sla.toast_duration_seconds]);

  const handleMutationError = useCallback((label: string, error: unknown) => {
    console.error(label, error);
    showToast(`${label} failed. Your view will be refreshed.`, 'error');
  }, [showToast]);

  const refreshData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setIsAuthenticated(false);
      setCurrentUserId('');
      setProfiles([]);
      setLeadsList([]);
      setFollowUpsList([]);
      setActivitiesList([]);
      setNotificationsList([]);
      setIsHydrated(true);
      return;
    }

    setIsAuthenticated(true);
    setCurrentUserId(user.id);
    const [profileRes, leadRes, followUpRes, activityRes, templateRes, settingsRes, notificationRes, tierRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('follow_ups').select('*').order('scheduled_at', { ascending: true }),
      supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('whatsapp_templates').select('*').order('created_at', { ascending: true }),
      supabase.from('agency_settings').select('settings').eq('id', 'default').maybeSingle(),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(250),
      supabase.from('incentive_tiers').select('*').order('min_sales', { ascending: true }),
    ]);

    const failed = [profileRes, leadRes, followUpRes, activityRes, templateRes, settingsRes, notificationRes, tierRes].find((result: any) => result.error);
    if (failed?.error) throw failed.error;

    setProfiles((profileRes.data || []) as Profile[]);
    setLeadsList((leadRes.data || []).map(normalizeLead));
    setFollowUpsList((followUpRes.data || []) as FollowUp[]);
    setActivitiesList((activityRes.data || []) as ActivityLog[]);
    setTemplatesList(templateRes.data || []);
    setNotificationsList((notificationRes.data || []) as AppNotification[]);
    setTiers((tierRes.data || []).map((tier: any) => ({
      ...tier,
      min_sales: toNumber(tier.min_sales),
      max_sales: tier.max_sales == null ? null : toNumber(tier.max_sales),
      commission_pct_profit: toNumber(tier.commission_pct_profit),
      milestone_bonus: toNumber(tier.milestone_bonus),
      min_margin_threshold: toNumber(tier.min_margin_threshold),
    })) as IncentiveTier[]);
    setSla({ ...DEFAULT_SETTINGS, ...((settingsRes.data?.settings || {}) as Partial<AgencySettings>), id: 'default' });
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    let mounted = true;
    refreshData().catch((error) => {
      if (mounted) {
        console.error('CRM hydration failed:', error);
        setIsHydrated(true);
      }
    });

    const supabase = getSupabaseBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        refreshData().catch((error) => console.error('CRM refresh failed:', error));
      }
      if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setCurrentUserId('');
        setProfiles([]);
        setLeadsList([]);
        setFollowUpsList([]);
        setActivitiesList([]);
        setNotificationsList([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [refreshData]);

  const profilesWithDynamicLoad = useMemo(() => profiles.map((profile) => ({
    ...profile,
    current_load: leadsList.filter((lead) => lead.assigned_to === profile.id && lead.stage !== 'won' && lead.stage !== 'lost').length,
  })), [profiles, leadsList]);

  const currentUser = profilesWithDynamicLoad.find((profile) => profile.id === currentUserId) || EMPTY_PROFILE;
  const visibleLeads = useMemo(() => isManagement(currentUser)
    ? leadsList
    : leadsList.filter((lead) => lead.assigned_to === currentUser.id || lead.assigned_to === null), [currentUser, leadsList]);
  const notifications = notificationsList.filter((item) => item.user_id === currentUser.id);
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const run = useCallback((label: string, operation: PromiseLike<unknown>) => {
    void Promise.resolve(operation).then((result: any) => {
      if (result?.error) throw result.error;
    }).catch((error) => {
      handleMutationError(label, error);
      void refreshData().catch(() => undefined);
    });
  }, [handleMutationError, refreshData]);

  const login = async (email: string, password = '') => {
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) return { success: false, error: 'Invalid email or password.' };
      await refreshData();
      return { success: true };
    } catch {
      return { success: false, error: 'Authentication service unavailable.' };
    }
  };

  const logout = () => {
    run('Sign out', getSupabaseBrowserClient().auth.signOut());
    setIsAuthenticated(false);
  };

  const switchUser = () => showToast('Role switching is disabled outside isolated demo environments.', 'warning');

  const updateAgentStatus = (status: AgentStatus) => {
    if (!currentUser.id) return;
    setProfiles((prev) => prev.map((profile) => profile.id === currentUser.id ? { ...profile, status } : profile));
    run('Status update', getSupabaseBrowserClient().from('profiles').update({ status }).eq('id', currentUser.id));
  };

  const getAgentMetrics = useCallback((agentId: string) => {
    const agent = profilesWithDynamicLoad.find((profile) => profile.id === agentId);
    const agentLeads = leadsList.filter((lead) => lead.assigned_to === agentId);
    const active = agentLeads.filter((lead) => lead.stage !== 'won' && lead.stage !== 'lost');
    const won = agentLeads.filter((lead) => lead.stage === 'won');
    const lost = agentLeads.filter((lead) => lead.stage === 'lost');
    const closed = won.length + lost.length;
    const frt = agentLeads.filter((lead) => lead.first_response_time_seconds != null);
    const avgSeconds = frt.length ? frt.reduce((sum, lead) => sum + (lead.first_response_time_seconds || 0), 0) / frt.length : 0;
    return {
      totalAssigned: agentLeads.length,
      activeLeads: active.length,
      wonCount: won.length,
      lostCount: lost.length,
      winRate: closed ? Math.round((won.length / closed) * 100) : 0,
      revenue: won.reduce((sum, lead) => sum + (lead.package_sale_price || lead.won_deal_value || 0), 0),
      grossProfit: won.reduce((sum, lead) => sum + (lead.gross_profit || 0), 0),
      avgFrtMinutes: Math.round(avgSeconds / 60),
      breaches: agentLeads.filter((lead) => lead.is_first_response_breached).length,
      activityCount: activitiesList.filter((activity) => activity.agent_id === agentId).length,
      capacityPct: Math.min(100, Math.round((active.length / (agent?.max_capacity || 25)) * 100)),
    };
  }, [activitiesList, leadsList, profilesWithDynamicLoad]);

  const chooseAssignee = (leadData: Partial<Lead>) => {
    if (currentUser.role === 'agent') return currentUser.id || null;
    if (leadData.assigned_to) return leadData.assigned_to;
    const available = profilesWithDynamicLoad.filter((profile) => profile.is_active && profile.status === 'available' && profile.accepting_leads !== false && profile.current_load < profile.max_capacity && profile.role === 'agent');
    const destination = (leadData.destination || '').toLowerCase();
    const specialists = available.filter((profile) => profile.destination_tags.some((tag) => destination.includes(tag.toLowerCase()) || tag.toLowerCase().includes(destination)));
    const pool = specialists.length ? specialists : available;
    pool.sort((a, b) => (a.current_load / a.max_capacity) - (b.current_load / b.max_capacity));
    return pool[0]?.id || null;
  };

  const addLead = (leadData: Partial<Lead>): Lead => {
    const now = new Date().toISOString();
    const assignedTo = chooseAssignee(leadData);
    const id = uuid();
    const newLead: Lead = {
      id,
      lead_code: `TRV-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`,
      customer_name: leadData.customer_name?.trim() || 'New Customer',
      customer_email: leadData.customer_email?.trim() || '',
      customer_phone: leadData.customer_phone?.trim() || '',
      customer_city: leadData.customer_city || '',
      customer_country: leadData.customer_country || '',
      destination: leadData.destination?.trim() || 'Unspecified',
      travel_dates: leadData.travel_dates || 'Flexible dates',
      duration_days: leadData.duration_days || 5,
      pax_adults: leadData.pax_adults ?? 2,
      pax_children: leadData.pax_children ?? 0,
      pax_infants: leadData.pax_infants ?? 0,
      travel_type: leadData.travel_type || 'family',
      budget_range: leadData.budget_range || '',
      hotel_category: leadData.hotel_category || '4-star',
      flight_required: leadData.flight_required ?? true,
      visa_required: leadData.visa_required ?? false,
      special_notes: leadData.special_notes || '',
      source: leadData.source || 'website',
      stage: 'new',
      priority: leadData.priority || 'normal',
      assigned_to: assignedTo,
      assigned_at: assignedTo ? now : undefined,
      first_response_due_at: assignedTo ? new Date(Date.now() + sla.frt_minutes * 60000).toISOString() : undefined,
      is_first_response_breached: false,
      next_follow_up_at: assignedTo ? new Date(Date.now() + sla.frt_minutes * 60000).toISOString() : null,
      created_at: now,
      updated_at: now,
    };
    setLeadsList((prev) => [newLead, ...prev]);
    run('Create lead', getSupabaseBrowserClient().from('leads').insert(newLead));
    return newLead;
  };

  const insertActivity = (activity: ActivityLog) => {
    setActivitiesList((prev) => [activity, ...prev]);
    run('Activity log', getSupabaseBrowserClient().from('activity_logs').insert(activity));
  };

  const getAgentIncentiveProfile = (agentId: string) => {
    const fallback: IncentiveTier = { id: 'default', name: 'Standard', min_sales: 0, max_sales: null, commission_pct_profit: 0, milestone_bonus: 0, min_margin_threshold: 0 };
    const sorted = tiers.length ? [...tiers].sort((a, b) => a.min_sales - b.min_sales) : [fallback];
    const won = leadsList.filter((lead) => lead.assigned_to === agentId && lead.stage === 'won');
    const totalSales = won.reduce((sum, lead) => sum + (lead.package_sale_price || lead.won_deal_value || 0), 0);
    const totalGrossProfit = won.reduce((sum, lead) => sum + (lead.gross_profit || 0), 0);
    let index = sorted.findIndex((tier) => totalSales >= tier.min_sales && (tier.max_sales == null || totalSales < tier.max_sales));
    if (index < 0) index = sorted.length - 1;
    const currentTier = sorted[index];
    const nextTier = sorted[index + 1] || null;
    return {
      currentTier,
      nextTier,
      totalSales,
      totalGrossProfit,
      avgProfitMargin: totalSales ? Math.round((totalGrossProfit / totalSales) * 1000) / 10 : 0,
      accruedCommission: won.filter((lead) => lead.commission_status === 'accrued').reduce((sum, lead) => sum + (lead.agent_commission_earned || 0), 0),
      approvedCommission: won.filter((lead) => lead.commission_status === 'approved').reduce((sum, lead) => sum + (lead.agent_commission_earned || 0), 0),
      paidCommission: won.filter((lead) => lead.commission_status === 'paid').reduce((sum, lead) => sum + (lead.agent_commission_earned || 0), 0),
      salesToNextTier: nextTier ? Math.max(0, nextTier.min_sales - totalSales) : 0,
      progressPct: nextTier ? Math.min(100, Math.max(0, Math.round(((totalSales - currentTier.min_sales) / Math.max(1, nextTier.min_sales - currentTier.min_sales)) * 100))) : 100,
      wonDealsCount: won.length,
    };
  };

  const updateLeadStage = (leadId: string, stage: LeadStage, lostReason?: string, lostNotes?: string, financials?: { packageSalePrice: number; vendorNetCost: number }) => {
    const target = leadsList.find((lead) => lead.id === leadId);
    if (!target) return;
    const now = new Date().toISOString();
    let salePrice = target.package_sale_price || target.won_deal_value || 0;
    let vendorCost = target.vendor_net_cost || 0;
    let profit = target.gross_profit || 0;
    let margin = target.profit_margin_pct || 0;
    let commission = target.agent_commission_earned || 0;
    if (stage === 'won' && financials) {
      salePrice = Math.max(0, financials.packageSalePrice);
      vendorCost = Math.max(0, financials.vendorNetCost);
      profit = Math.max(0, salePrice - vendorCost);
      margin = salePrice ? Math.round((profit / salePrice) * 1000) / 10 : 0;
      const tier = getAgentIncentiveProfile(target.assigned_to || currentUser.id).currentTier;
      const rate = margin >= tier.min_margin_threshold ? tier.commission_pct_profit : tier.commission_pct_profit * 0.5;
      commission = Math.round(profit * rate) / 100;
    }
    const patch: Partial<Lead> = {
      stage,
      updated_at: now,
      closed_at: stage === 'won' || stage === 'lost' ? now : target.closed_at,
      lost_reason: stage === 'lost' ? (lostReason || 'other') : target.lost_reason,
      lost_notes: stage === 'lost' ? lostNotes : target.lost_notes,
    };
    if (stage === 'won') Object.assign(patch, { package_sale_price: salePrice, vendor_net_cost: vendorCost, gross_profit: profit, profit_margin_pct: margin, agent_commission_earned: commission, commission_status: 'accrued', won_deal_value: salePrice });
    setLeadsList((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, ...patch } : lead));
    run('Update lead stage', getSupabaseBrowserClient().from('leads').update(patch).eq('id', leadId));
    insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'stage_change', title: `Stage: ${stage.toUpperCase().replaceAll('_', ' ')}`, outcome: stage === 'won' ? 'Won' : stage === 'lost' ? 'Lost' : 'Progressed', notes: stage === 'lost' ? `Reason: ${lostReason || 'other'}. ${lostNotes || ''}` : `Updated by ${currentUser.full_name}`, created_at: now });
  };

  const approveCommissionPayout = (leadId: string, newStatus: CommissionStatus = 'approved') => {
    if (!isManagement(currentUser)) return showToast('Manager or administrator access required.', 'error');
    setLeadsList((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, commission_status: newStatus, updated_at: new Date().toISOString() } : lead));
    run('Commission update', getSupabaseBrowserClient().from('leads').update({ commission_status: newStatus }).eq('id', leadId));
  };

  const assignLead = (leadId: string, agentId: string) => {
    if (!isManagement(currentUser)) return showToast('Manager or administrator access required.', 'error');
    const now = new Date().toISOString();
    setLeadsList((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, assigned_to: agentId, assigned_at: now, updated_at: now } : lead));
    run('Lead assignment', getSupabaseBrowserClient().from('leads').update({ assigned_to: agentId, assigned_at: now, assigned_by: currentUser.id }).eq('id', leadId));
    insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'reassignment', title: `Reassigned to ${profiles.find((profile) => profile.id === agentId)?.full_name || 'agent'}`, notes: `Reassigned by ${currentUser.full_name}`, created_at: now });
  };

  const logActivity = (data: { leadId: string; type: ActivityType; title: string; outcome?: string; notes?: string; duration?: number; nextFollowUp?: { scheduled_at: string; channel: FollowUpChannel; title?: string; notes?: string } }) => {
    const now = new Date().toISOString();
    const lead = leadsList.find((item) => item.id === data.leadId);
    if (!lead) return;
    const firstContact = lead.first_contacted_at || now;
    const frtSeconds = lead.first_response_time_seconds ?? (lead.assigned_at ? Math.max(0, Math.floor((Date.now() - new Date(lead.assigned_at).getTime()) / 1000)) : null);
    const patch: Partial<Lead> = { stage: lead.stage === 'new' ? 'contacted' : lead.stage, first_contacted_at: firstContact, first_response_time_seconds: frtSeconds, is_first_response_breached: frtSeconds != null ? frtSeconds > sla.frt_minutes * 60 : lead.is_first_response_breached, last_contacted_at: now, last_activity_type: data.type, next_follow_up_at: data.nextFollowUp?.scheduled_at || lead.next_follow_up_at, updated_at: now };
    setLeadsList((prev) => prev.map((item) => item.id === data.leadId ? { ...item, ...patch } : item));
    run('Lead contact update', getSupabaseBrowserClient().from('leads').update(patch).eq('id', data.leadId));
    insertActivity({ id: uuid(), lead_id: data.leadId, agent_id: currentUser.id, activity_type: data.type, title: data.title, outcome: data.outcome, notes: data.notes, call_duration_seconds: data.duration, created_at: now });
    if (data.nextFollowUp) createFollowUp({ lead_id: data.leadId, assigned_to: currentUser.id, title: data.nextFollowUp.title || `Follow-up on ${lead.destination}`, scheduled_at: data.nextFollowUp.scheduled_at, channel: data.nextFollowUp.channel, notes: data.nextFollowUp.notes || data.notes, priority: 'high' });
  };

  const createFollowUp = (data: Partial<FollowUp>) => {
    if (!data.lead_id) return;
    const now = new Date().toISOString();
    const assignedTo = currentUser.role === 'agent' ? currentUser.id : (data.assigned_to || currentUser.id);
    const followUp: FollowUp = { id: uuid(), lead_id: data.lead_id, assigned_to: assignedTo, title: data.title || 'Scheduled Follow-up', scheduled_at: data.scheduled_at || new Date(Date.now() + 86400000).toISOString(), channel: data.channel || 'call', priority: data.priority || 'normal', status: 'pending', notes: data.notes || '', created_at: now };
    setFollowUpsList((prev) => [followUp, ...prev]);
    run('Create follow-up', getSupabaseBrowserClient().from('follow_ups').insert(followUp));
  };

  const completeFollowUp = (followUpId: string, completionNotes?: string) => {
    const now = new Date().toISOString();
    const patch = { status: 'completed', completion_notes: completionNotes || 'Completed', completed_at: now, updated_at: now };
    setFollowUpsList((prev) => prev.map((item) => item.id === followUpId ? { ...item, ...patch } as FollowUp : item));
    run('Complete follow-up', getSupabaseBrowserClient().from('follow_ups').update(patch).eq('id', followUpId));
  };

  const markNotificationAsRead = (id: string) => {
    setNotificationsList((prev) => prev.map((item) => item.id === id ? { ...item, is_read: true } : item));
    run('Notification update', getSupabaseBrowserClient().from('notifications').update({ is_read: true }).eq('id', id));
  };

  const markAllNotificationsAsRead = () => {
    setNotificationsList((prev) => prev.map((item) => item.user_id === currentUser.id ? { ...item, is_read: true } : item));
    run('Notifications update', getSupabaseBrowserClient().from('notifications').update({ is_read: true }).eq('user_id', currentUser.id));
  };

  const updateAgencySettings = (settings: Partial<AgencySettings>) => {
    const previous = sla;
    const symbols: Record<CurrencyCode, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AUD: 'A$', AED: 'AED ' };
    const next = { ...sla, ...settings, ...(settings.currency ? { currency_symbol: symbols[settings.currency] } : {}) };
    setSla(next);
    void fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error || 'Settings update failed');
    }).catch((error) => { setSla(previous); handleMutationError('Settings update', error); });
  };
  const updateSlaSettings = updateAgencySettings;

  const updateUserPreferences = (profileId: string, prefs: Partial<UserPreferences>) => {
    if (profileId !== currentUser.id) return;
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    const user_preferences = { ...(profile.user_preferences || {}), ...prefs };
    setProfiles((prev) => prev.map((item) => item.id === profileId ? { ...item, user_preferences } : item));
    run('Preferences update', getSupabaseBrowserClient().from('profiles').update({ user_preferences }).eq('id', profileId));
  };

  const updateTemplates = (nextTemplates: any[]) => {
    if (!isManagement(currentUser)) return showToast('Manager or administrator access required.', 'error');
    setTemplatesList(nextTemplates);
    const supabase = getSupabaseBrowserClient();
    void (async () => {
      const { error: deleteError } = await supabase.from('whatsapp_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (deleteError) throw deleteError;
      if (nextTemplates.length) {
        const { error } = await supabase.from('whatsapp_templates').insert(nextTemplates.map((template) => ({ ...template, id: /^[0-9a-f-]{36}$/i.test(template.id || '') ? template.id : uuid() })));
        if (error) throw error;
      }
    })().catch((error) => handleMutationError('Template update', error));
  };

  const updateIncentiveTiers = (nextTiers: IncentiveTier[]) => {
    if (currentUser.role !== 'admin') return showToast('Administrator access required.', 'error');
    setTiers(nextTiers);
    showToast('Incentive tier edits require the protected server administration endpoint.', 'warning');
  };

  const updateProfile = (profileId: string, updates: Partial<Profile>) => {
    setProfiles((prev) => prev.map((profile) => profile.id === profileId ? { ...profile, ...updates } : profile));
    run('Profile update', getSupabaseBrowserClient().from('profiles').update(updates).eq('id', profileId));
  };

  const createProfile = async (data: Omit<Profile, 'id' | 'created_at' | 'current_load'>): Promise<Profile | null> => {
    try {
      const response = await fetch('/api/team/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Invite failed');
      const profile = payload.profile as Profile;
      setProfiles((prev) => [...prev, profile]);
      return profile;
    } catch (error) {
      handleMutationError('Team invitation', error);
      return null;
    }
  };

  const toggleAgentAcceptingLeads = (profileId: string) => {
    if (!isManagement(currentUser)) return;
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    updateProfile(profileId, { accepting_leads: !profile.accepting_leads });
  };

  const bulkReassignAgentLeads = (fromAgentId: string, toAgentId: string) => {
    if (!isManagement(currentUser)) return 0;
    const ids = leadsList.filter((lead) => lead.assigned_to === fromAgentId && lead.stage !== 'won' && lead.stage !== 'lost').map((lead) => lead.id);
    if (!ids.length) return 0;
    const now = new Date().toISOString();
    setLeadsList((prev) => prev.map((lead) => ids.includes(lead.id) ? { ...lead, assigned_to: toAgentId, assigned_at: now, updated_at: now } : lead));
    run('Bulk reassignment', getSupabaseBrowserClient().from('leads').update({ assigned_to: toAgentId, assigned_at: now, assigned_by: currentUser.id }).in('id', ids));
    ids.forEach((leadId) => insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'reassignment', title: 'Bulk lead reassignment', notes: `Reassigned to ${profiles.find((profile) => profile.id === toAgentId)?.full_name || 'agent'}`, created_at: now }));
    return ids.length;
  };

  const formatCurrency = (amount: number) => `${sla.currency_symbol || '$'}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount || 0)}`;
  const formatAppDate = (date: string | Date) => {
    const value = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(date);
    if (Number.isNaN(value.getTime())) return String(date || '');
    const year = value.getUTCFullYear(); const month = String(value.getUTCMonth() + 1).padStart(2, '0'); const day = String(value.getUTCDate()).padStart(2, '0');
    return sla.date_format === 'YYYY-MM-DD' ? `${year}-${month}-${day}` : sla.date_format === 'MM/DD/YYYY' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
  };

  const playNotificationSound = (presetOverride?: SoundPreset, customVolume?: number) => {
    if (typeof window === 'undefined') return;
    const preset = presetOverride || sla.notification_sound_preset;
    if ((!sla.notification_sound_enabled && !presetOverride) || preset === 'off') return;
    if (sla.mute_sound_in_call && currentUser.status === 'in_call' && !presetOverride) return;
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = new AudioContextCtor();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const frequencies: Record<string, number> = { chime: 587.33, modern_bell: 880, radar: 1046.5, subtle: 440 };
      oscillator.type = preset === 'modern_bell' ? 'triangle' : 'sine';
      oscillator.frequency.value = frequencies[preset || 'chime'] || 587.33;
      gain.gain.value = 0.25 * Math.max(0, Math.min(1, (customVolume ?? sla.notification_volume ?? 75) / 100));
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.3);
      setTimeout(() => void ctx.close(), 400);
    } catch (error) { console.warn('Notification audio unavailable:', error); }
  };

  const resetToFactoryDefaults = () => showToast('Factory reset is disabled in production. Use a controlled database restore instead.', 'warning');
  const exportCrmBackup = () => {
    if (typeof window === 'undefined' || currentUser.role !== 'admin') return;
    const backup = { app: 'Wanderlust Travel CRM', version: 2, exported_at: new Date().toISOString(), data: { profiles: profilesWithDynamicLoad, leadsList, followUpsList, activitiesList, templatesList, sla, notificationsList, tiers } };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `wanderlust_crm_backup_${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importCrmBackup = () => { showToast('Browser-side database restore is disabled for safety.', 'warning'); return false; };

  const persistLeadJson = (leadId: string, patch: Partial<Lead>, label: string) => {
    setLeadsList((prev) => prev.map((lead) => lead.id === leadId ? { ...lead, ...patch, updated_at: new Date().toISOString() } : lead));
    run(label, getSupabaseBrowserClient().from('leads').update(patch).eq('id', leadId));
  };

  const createLeadQuotation = (leadId: string, quoteData: Partial<LeadQuotation>): LeadQuotation => {
    const lead = leadsList.find((item) => item.id === leadId);
    const quote: LeadQuotation = { id: uuid(), lead_id: leadId, quote_number: `QT-${Date.now().toString().slice(-8)}`, package_title: quoteData.package_title || 'Custom Travel Package', destination: quoteData.destination || lead?.destination || '', duration_days: quoteData.duration_days || lead?.duration_days || 5, travel_dates: quoteData.travel_dates || lead?.travel_dates || '', pax_summary: quoteData.pax_summary || `${lead?.pax_adults || 2} Adults`, hotel_category: quoteData.hotel_category || lead?.hotel_category || '', line_items: quoteData.line_items || [], total_selling_price: quoteData.total_selling_price || 0, total_supplier_cost: quoteData.total_supplier_cost || 0, gross_profit: quoteData.gross_profit || 0, profit_margin_pct: quoteData.profit_margin_pct || 0, commission_earned: quoteData.commission_earned || 0, inclusions: quoteData.inclusions || [], exclusions: quoteData.exclusions || [], validity_days: quoteData.validity_days || 7, status: quoteData.status || 'sent', created_at: new Date().toISOString() };
    const quotes = [quote, ...(lead?.quotes || [])];
    persistLeadJson(leadId, { quotes, latest_quote: quote, package_sale_price: quote.total_selling_price, vendor_net_cost: quote.total_supplier_cost, gross_profit: quote.gross_profit, profit_margin_pct: quote.profit_margin_pct, agent_commission_earned: quote.commission_earned, stage: 'quote_sent' }, 'Save quotation');
    insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'quote', title: `Quotation Generated (${quote.quote_number})`, notes: `${formatCurrency(quote.total_selling_price)} package quotation`, created_at: quote.created_at });
    return quote;
  };

  const bulkAssignLeads = (leadIds: string[], agentId: string) => {
    if (!isManagement(currentUser) || !leadIds.length) return;
    const now = new Date().toISOString();
    setLeadsList((prev) => prev.map((lead) => leadIds.includes(lead.id) ? { ...lead, assigned_to: agentId, assigned_at: now, updated_at: now } : lead));
    run('Bulk assign leads', getSupabaseBrowserClient().from('leads').update({ assigned_to: agentId, assigned_at: now, assigned_by: currentUser.id }).in('id', leadIds));
  };
  const bulkUpdateLeadStage = (leadIds: string[], stage: LeadStage) => {
    if (!leadIds.length) return;
    setLeadsList((prev) => prev.map((lead) => leadIds.includes(lead.id) ? { ...lead, stage, updated_at: new Date().toISOString() } : lead));
    run('Bulk stage update', getSupabaseBrowserClient().from('leads').update({ stage }).in('id', leadIds));
  };

  const addPaymentRecord = (leadId: string, payment: { amount: number; method: PaymentMethod; reference_no?: string; notes?: string }): PaymentRecord => {
    const lead = leadsList.find((item) => item.id === leadId); const now = new Date().toISOString();
    const record: PaymentRecord = { id: uuid(), lead_id: leadId, receipt_number: `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`, amount: payment.amount, method: payment.method, reference_no: payment.reference_no, notes: payment.notes, received_at: now, created_at: now };
    persistLeadJson(leadId, { payment_records: [record, ...(lead?.payment_records || [])] }, 'Record payment');
    insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'payment', title: `Payment Received (${formatCurrency(payment.amount)})`, notes: `Receipt ${record.receipt_number}`, created_at: now });
    return record;
  };
  const updatePaymentMilestones = (leadId: string, payment_milestones: PaymentMilestone[]) => persistLeadJson(leadId, { payment_milestones }, 'Update payment milestones');
  const updateItineraryDays = (leadId: string, itinerary_days: ItineraryDay[]) => persistLeadJson(leadId, { itinerary_days }, 'Update itinerary');

  const checkPassportValidity = (expiry?: string) => {
    if (!expiry) return false;
    const date = new Date(expiry); if (Number.isNaN(date.getTime())) return false;
    const threshold = new Date(); threshold.setMonth(threshold.getMonth() + 6); return date >= threshold;
  };
  const addPassenger = (leadId: string, passenger: Omit<TravelerPassenger, 'id' | 'lead_id'>): TravelerPassenger => {
    const lead = leadsList.find((item) => item.id === leadId); const created: TravelerPassenger = { ...passenger, id: uuid(), lead_id: leadId, is_passport_valid_6months: passenger.passport_expiry_date ? checkPassportValidity(passenger.passport_expiry_date) : passenger.is_passport_valid_6months };
    persistLeadJson(leadId, { passengers: [...(lead?.passengers || []), created] }, 'Add passenger');
    insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'document', title: `Passenger Added: ${created.full_name}`, notes: `${created.type.toUpperCase()} passenger record added`, created_at: new Date().toISOString() });
    return created;
  };
  const updatePassenger = (leadId: string, passengerId: string, updates: Partial<TravelerPassenger>) => {
    const lead = leadsList.find((item) => item.id === leadId); if (!lead) return;
    const passengers = (lead.passengers || []).map((passenger) => passenger.id === passengerId ? { ...passenger, ...updates, ...(updates.passport_expiry_date ? { is_passport_valid_6months: checkPassportValidity(updates.passport_expiry_date) } : {}) } : passenger);
    persistLeadJson(leadId, { passengers }, 'Update passenger');
  };
  const deletePassenger = (leadId: string, passengerId: string) => { const lead = leadsList.find((item) => item.id === leadId); if (lead) persistLeadJson(leadId, { passengers: (lead.passengers || []).filter((passenger) => passenger.id !== passengerId) }, 'Delete passenger'); };
  const addDocument = (leadId: string, document: Omit<TravelerDocument, 'id' | 'lead_id' | 'uploaded_at'>): TravelerDocument => { const lead = leadsList.find((item) => item.id === leadId); const created: TravelerDocument = { ...document, id: uuid(), lead_id: leadId, uploaded_at: new Date().toISOString() }; persistLeadJson(leadId, { documents: [created, ...(lead?.documents || [])] }, 'Add document'); insertActivity({ id: uuid(), lead_id: leadId, agent_id: currentUser.id, activity_type: 'document', title: `Document Added: ${created.title}`, notes: `Category: ${created.category}`, created_at: created.uploaded_at }); return created; };
  const deleteDocument = (leadId: string, documentId: string) => { const lead = leadsList.find((item) => item.id === leadId); if (lead) persistLeadJson(leadId, { documents: (lead.documents || []).filter((document) => document.id !== documentId) }, 'Delete document'); };
  const updateSupplierPayables = (leadId: string, supplier_payables: LeadSupplierPayable[]) => persistLeadJson(leadId, { supplier_payables }, 'Update supplier payables');
  const updatePreDepartureChecklist = (leadId: string, checklistPatch: Partial<PreDepartureChecklist>) => { const lead = leadsList.find((item) => item.id === leadId); if (!lead) return; const checklist = { flights_ticketed: false, hotel_vouchers_issued: false, passports_verified_6months: false, visas_confirmed: false, travel_insurance_issued: false, web_checkin_completed: false, emergency_contacts_dispatched: false, ...(lead.checklist || {}), ...checklistPatch }; persistLeadJson(leadId, { checklist, trip_status: Object.values(checklist).every(Boolean) ? 'pre_departure' : lead.trip_status }, 'Update departure checklist'); };
  const recordPostTripReview = (leadId: string, review: PostTripReview) => persistLeadJson(leadId, { post_trip_review: { ...review, reviewed_at: new Date().toISOString() }, trip_status: 'completed' }, 'Record post-trip review');
  const updateTripStatus = (leadId: string, trip_status: TripLifecycleStatus) => persistLeadJson(leadId, { trip_status }, 'Update trip status');

  const executeFollowUpDisposition = (leadId: string, followUpId: string, disposition: FollowUpDisposition) => {
    const existing = followUpsList.find((item) => item.id === followUpId); if (!existing) return;
    const now = new Date().toISOString();
    const patch = { status: 'completed', disposition: disposition.outcome, completion_notes: disposition.notes || disposition.outcome.replaceAll('_', ' '), completed_at: now };
    setFollowUpsList((prev) => prev.map((item) => item.id === followUpId ? { ...item, ...patch } as FollowUp : item));
    run('Complete follow-up', getSupabaseBrowserClient().from('follow_ups').update(patch).eq('id', followUpId));
    if (disposition.outcome === 'lost') updateLeadStage(leadId, 'lost', disposition.lost_reason || 'other', disposition.notes);
    const callback = disposition.callback_at || (disposition.outcome === 'no_answer' ? new Date(Date.now() + 3 * 3600000).toISOString() : disposition.outcome === 'engaged_interested' ? new Date(Date.now() + 2 * 86400000).toISOString() : disposition.outcome === 'quote_revision' ? new Date(Date.now() + 86400000).toISOString() : undefined);
    if (callback && !['lost', 'completed'].includes(disposition.outcome)) createFollowUp({ lead_id: leadId, assigned_to: existing.assigned_to || currentUser.id, title: disposition.outcome === 'quote_revision' ? 'Send Revised Itinerary & Costing' : 'Scheduled Follow-up', scheduled_at: callback, channel: disposition.outcome === 'quote_revision' ? 'whatsapp' : existing.channel, notes: disposition.notes, retry_count: (existing.retry_count || 0) + (disposition.outcome === 'no_answer' ? 1 : 0), rescheduled_from_id: followUpId });
  };

  const getAgentHealthScore = (agentId: string): EmployeeHealthScore => {
    const profile = profilesWithDynamicLoad.find((item) => item.id === agentId); const metrics = getAgentMetrics(agentId); const tasks = followUpsList.filter((item) => item.assigned_to === agentId); const overdue = tasks.filter((item) => item.status !== 'completed' && new Date(item.scheduled_at).getTime() < Date.now()); const completed = tasks.filter((item) => item.status === 'completed'); const onTime = completed.length + overdue.length ? Math.round((completed.length / (completed.length + overdue.length)) * 100) : 100; const slaScore = Math.max(0, 100 - metrics.breaches * 25 - (metrics.avgFrtMinutes > 30 ? 20 : metrics.avgFrtMinutes > 15 ? 10 : 0)); const followupScore = Math.max(0, onTime - overdue.length * 12); const conversionScore = Math.max(20, Math.min(100, Math.round(metrics.winRate * 0.6 + 40))); const workloadScore = metrics.capacityPct > 100 ? 35 : metrics.capacityPct > 85 ? 60 : metrics.capacityPct < 20 ? 75 : 95; const overall = Math.round(slaScore * .3 + followupScore * .3 + conversionScore * .25 + workloadScore * .15); const recommendations = overdue.length ? [`Clear ${overdue.length} overdue follow-up${overdue.length === 1 ? '' : 's'}.`] : metrics.breaches ? [`Prioritize ${metrics.breaches} SLA-breached lead${metrics.breaches === 1 ? '' : 's'}.`] : ['On-time follow-ups and healthy pipeline load.']; return { agent_id: agentId, overall_score: overall, grade: overall >= 85 ? 'elite' : overall >= 70 ? 'healthy' : overall >= 50 ? 'attention_needed' : 'burnout_risk', sla_score: slaScore, followup_score: followupScore, conversion_score: conversionScore, workload_score: workloadScore, avg_frt_minutes: metrics.avgFrtMinutes, on_time_followup_pct: onTime, active_leads_count: metrics.activeLeads, overdue_tasks_count: overdue.length, capacity_pct: metrics.capacityPct, last_active_at: activitiesList.find((activity) => activity.agent_id === agentId)?.created_at || profile?.created_at, recommendations };
  };

  const rebalanceOverdueFollowUps = (fromAgentId: string, toAgentId?: string) => {
    if (!isManagement(currentUser)) return 0;
    const overdue = followUpsList.filter((item) => item.assigned_to === fromAgentId && item.status !== 'completed' && new Date(item.scheduled_at).getTime() < Date.now()); if (!overdue.length) return 0;
    const target = toAgentId || profilesWithDynamicLoad.filter((profile) => profile.id !== fromAgentId && profile.role === 'agent' && profile.is_active && profile.accepting_leads && profile.status === 'available').sort((a, b) => (a.current_load / a.max_capacity) - (b.current_load / b.max_capacity))[0]?.id; if (!target) return 0;
    const ids = overdue.map((item) => item.id); const leadIds = Array.from(new Set(overdue.map((item) => item.lead_id)));
    setFollowUpsList((prev) => prev.map((item) => ids.includes(item.id) ? { ...item, assigned_to: target } : item));
    run('Rebalance follow-ups', getSupabaseBrowserClient().from('follow_ups').update({ assigned_to: target }).in('id', ids));
    bulkAssignLeads(leadIds, target); return overdue.length;
  };

  const exportFollowUpsIcal = (tasks?: FollowUp[]) => {
    if (typeof window === 'undefined') return;
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const date = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const list = tasks || followUpsList.filter((item) => item.status !== 'completed');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wanderlust CRM//Follow-up Agenda//EN', 'CALSCALE:GREGORIAN'];
    list.forEach((task) => { const lead = leadsList.find((item) => item.id === task.lead_id); lines.push('BEGIN:VEVENT', `UID:${escape(task.id)}@wanderlust-crm`, `DTSTAMP:${date(new Date().toISOString())}`, `DTSTART:${date(task.scheduled_at)}`, `DTEND:${date(new Date(new Date(task.scheduled_at).getTime() + 30 * 60000).toISOString())}`, `SUMMARY:${escape(`CRM: ${task.title}${lead ? ` - ${lead.customer_name}` : ''}`)}`, `DESCRIPTION:${escape(`Customer: ${lead?.customer_name || 'N/A'}\nPhone: ${lead?.customer_phone || 'N/A'}\nChannel: ${task.channel}\nNotes: ${task.notes || 'None'}`)}`, 'END:VEVENT'); });
    lines.push('END:VCALENDAR'); const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `wanderlust_agenda_${new Date().toISOString().slice(0, 10)}.ics`; link.click(); URL.revokeObjectURL(url);
  };

  return <AppContext.Provider value={{ currentUser, allProfiles: profilesWithDynamicLoad, leads: visibleLeads, allLeads: visibleLeads, followUps: followUpsList, activities: activitiesList, templates: templatesList, slaSettings: sla, agencySettings: sla, notifications, unreadCount, incentiveTiers: tiers, isAuthenticated, login, logout, switchUser, updateAgentStatus, addLead, updateLeadStage, assignLead, logActivity, completeFollowUp, createFollowUp, markNotificationAsRead, markAllNotificationsAsRead, updateSlaSettings, updateAgencySettings, updateUserPreferences, updateTemplates, updateIncentiveTiers, approveCommissionPayout, getAgentIncentiveProfile, updateProfile, createProfile, toggleAgentAcceptingLeads, bulkReassignAgentLeads, getAgentMetrics, playNotificationSound, formatCurrency, formatAppDate, isHydrated, resetToFactoryDefaults, exportCrmBackup, importCrmBackup, createLeadQuotation, bulkAssignLeads, bulkUpdateLeadStage, addPaymentRecord, updatePaymentMilestones, updateItineraryDays, addPassenger, updatePassenger, deletePassenger, addDocument, deleteDocument, updatePreDepartureChecklist, updateSupplierPayables, recordPostTripReview, updateTripStatus, executeFollowUpDisposition, getAgentHealthScore, rebalanceOverdueFollowUps, exportFollowUpsIcal, toast, showToast, hideToast }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}

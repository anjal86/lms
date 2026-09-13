export type Role = 'admin' | 'manager' | 'agent';

export type AgentStatus = 'available' | 'in_call' | 'on_break' | 'offline';

export interface UserPreferences {
  idle_auto_away_minutes: number;
  default_landing_page: '/dashboard' | '/leads' | '/follow-ups' | '/analytics' | '/team';
  kanban_density: 'compact' | 'expanded';
  instant_whatsapp_direct: boolean;
  default_country_code: string;
}

export interface Profile {
  id: string;
  workspace_id?: string;
  employee_code?: string;
  email: string;
  full_name: string;
  role: Role;
  phone?: string;
  direct_extension?: string;
  avatar_url?: string;
  destination_tags: string[];
  max_capacity: number;
  current_load: number;
  status: AgentStatus;
  is_active: boolean;
  accepting_leads?: boolean;
  bio?: string;
  languages?: string[];
  office_location?: string;
  certifications?: string[];
  user_preferences?: UserPreferences;
  created_at: string;
  updated_at?: string;
}

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'quote_sent'
  | 'in_negotiation'
  | 'won'
  | 'lost'
  | 'junk';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export type TravelType =
  | 'honeymoon'
  | 'family'
  | 'luxury'
  | 'adventure'
  | 'corporate'
  | 'budget'
  | 'pilgrimage'
  | 'custom';

export type CommissionStatus = 'accrued' | 'approved' | 'paid';

export interface Lead {
  id: string;
  workspace_id?: string;
  pipeline_id?: string | null;
  pipeline_stage_id?: string | null;
  custom_data?: Record<string, unknown>;
  lead_code: string;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  customer_city?: string;
  customer_country?: string;
  destination: string;
  travel_dates?: string;
  duration_days: number;
  pax_adults: number;
  pax_children: number;
  pax_infants: number;
  travel_type: TravelType;
  budget_range?: string;
  hotel_category?: string;
  flight_required: boolean;
  visa_required: boolean;
  special_notes?: string;
  source: string;
  external_id?: string | null;
  duplicate_of?: string | null;
  lead_score?: number;
  lead_temperature?: 'cold' | 'warm' | 'hot';
  stage: LeadStage;
  priority: Priority;
  assigned_to: string | null;
  assigned_at?: string;
  assigned_by?: string | null;
  first_response_due_at?: string;
  first_contacted_at?: string;
  first_response_time_seconds?: number | null;
  is_first_response_breached?: boolean;
  next_follow_up_at?: string | null;
  last_contacted_at?: string | null;
  last_activity_type?: string | null;

  // Financial, Profit & Incentive metrics
  won_deal_value?: number | null;
  package_sale_price?: number | null;
  vendor_net_cost?: number | null;
  gross_profit?: number | null;
  profit_margin_pct?: number | null;
  agent_commission_earned?: number | null;
  commission_status?: CommissionStatus;

  lost_reason?: string | null;
  lost_notes?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  assigned_profile?: Profile;
  quotes?: LeadQuotation[];
  latest_quote?: LeadQuotation;

  // Operational & Lifecycle Systems
  trip_status?: TripLifecycleStatus;
  payment_milestones?: PaymentMilestone[];
  payment_records?: PaymentRecord[];
  itinerary_days?: ItineraryDay[];
  passengers?: TravelerPassenger[];
  documents?: TravelerDocument[];
  supplier_payables?: LeadSupplierPayable[];
  checklist?: PreDepartureChecklist;
  post_trip_review?: PostTripReview;
}

export interface QuoteLineItem {
  id: string;
  category: 'flight' | 'hotel' | 'transfer' | 'sightseeing' | 'insurance' | 'visa' | 'markup' | 'other';
  description: string;
  supplier_cost: number;
  client_price: number;
}

export interface LeadQuotation {
  id: string;
  lead_id: string;
  quote_number: string;
  package_title: string;
  destination: string;
  duration_days: number;
  travel_dates?: string;
  pax_summary: string;
  hotel_category?: string;
  line_items: QuoteLineItem[];
  total_selling_price: number;
  total_supplier_cost: number;
  gross_profit: number;
  profit_margin_pct: number;
  commission_earned: number;
  inclusions?: string[];
  exclusions?: string[];
  validity_days: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  created_at: string;
}

export interface QuoteVersion {
  id: string;
  lead_id: string;
  version_number: number;
  quote: LeadQuotation;
  created_by?: string | null;
  created_at: string;
}

export interface IncentiveTier {
  id: string;
  name: string;
  min_sales: number;
  max_sales: number | null;
  commission_pct_profit: number;
  milestone_bonus: number;
  min_margin_threshold: number;
  perk_description?: string;
}

export type FollowUpChannel = 'call' | 'whatsapp' | 'email' | 'meeting';
export type FollowUpStatus = 'pending' | 'completed' | 'missed' | 'cancelled';

export type FollowUpDispositionType =
  | 'no_answer'
  | 'engaged_interested'
  | 'quote_revision'
  | 'snooze'
  | 'lost'
  | 'completed';

export interface FollowUpDisposition {
  followUpId: string;
  outcome: FollowUpDispositionType;
  notes?: string;
  callback_at?: string;
  auto_whatsapp?: boolean;
  lost_reason?: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  assigned_to?: string;
  agent_id?: string;
  title: string;
  scheduled_at: string;
  channel: FollowUpChannel;
  priority?: Priority;
  status: FollowUpStatus;
  notes?: string;
  completion_notes?: string;
  completed_at?: string | null;
  disposition?: FollowUpDispositionType;
  is_escalated?: boolean;
  escalated_at?: string;
  retry_count?: number;
  rescheduled_from_id?: string;
  created_at: string;
  updated_at?: string;
  lead?: Lead;
  agent?: Profile;
}

export type ActivityType = 'call' | 'whatsapp' | 'email' | 'note' | 'quote' | 'payment' | 'document' | 'stage_change' | 'reassignment' | 'sla_alert' | 'system';

export interface ActivityLog {
  id: string;
  lead_id?: string | null;
  agent_id?: string | null;
  activity_type: ActivityType;
  title: string;
  outcome?: string;
  notes?: string;
  call_duration_seconds?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AgencySettings {
  id: string;
  frt_minutes: number;
  overdue_grace_minutes: number;
  escalate_to_manager: boolean;
  auto_reassign_breached_leads: boolean;
  auto_reassign_hours: number;
  business_hours_start: string;
  business_hours_end: string;
  freeze_sla_weekends: boolean;
  timezone: string;
  pre_breach_warning_minutes: number;
  routing_strategy: string;
  routing_overflow_policy: string;
  vip_high_budget_threshold: number;
  vip_route_seniors_only: boolean;
  lead_cooldown_minutes: number;
  currency: CurrencyCode;
  currency_symbol: string;
  date_format: string;
  commission_tds_pct: number;
  min_gross_margin_threshold: number;
  payout_frequency: string;
  notification_sound_enabled: boolean;
  notification_sound_preset: SoundPreset;
  notification_volume: number;
  mute_sound_in_call: boolean;
  browser_push_enabled: boolean;
  toast_duration_seconds: number;
  custom_lost_reasons: string[];
  custom_lead_sources: string[];
  auto_archive_days: number;
}

export type CurrencyCode = 'USD' | 'NPR' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'JPY' | 'INR' | string;
export type SoundPreset = 'chime' | 'bell' | 'pop' | 'none' | string;

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export interface PaymentMilestone {
  id: string;
  lead_id: string;
  title: string;
  due_date: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'online' | 'other';

export interface PaymentRecord {
  id: string;
  lead_id: string;
  amount: number;
  method: PaymentMethod;
  reference_no?: string;
  notes?: string;
  received_at: string;
}

export interface ItineraryDay {
  id: string;
  lead_id: string;
  day_number: number;
  title: string;
  description?: string;
  hotel?: string;
  meals?: string;
}

export interface TravelerPassenger {
  id: string;
  lead_id: string;
  full_name: string;
  age?: number;
  passenger_type?: 'adult' | 'child' | 'infant';
  passport_number?: string;
  nationality?: string;
  date_of_birth?: string;
}

export interface TravelerDocument {
  id: string;
  lead_id: string;
  name: string;
  type: string;
  url?: string;
  storage_path?: string;
  uploaded_at: string;
}

export interface LeadSupplierPayable {
  id: string;
  lead_id: string;
  supplier_name: string;
  category: string;
  amount: number;
  status: 'pending' | 'paid';
  due_date?: string;
}

export interface PreDepartureChecklist {
  passport_verified?: boolean;
  visa_verified?: boolean;
  flights_confirmed?: boolean;
  hotels_confirmed?: boolean;
  insurance_confirmed?: boolean;
  final_payment_received?: boolean;
}

export interface PostTripReview {
  rating?: number;
  feedback?: string;
  reviewed_at?: string;
}

export type TripLifecycleStatus = 'planning' | 'booked' | 'pre_departure' | 'on_trip' | 'completed';

export interface EmployeeHealthScore {
  score: number;
  band: 'excellent' | 'good' | 'watch' | 'risk';
  active_load: number;
  overdue_followups: number;
  sla_breaches: number;
  win_rate: number;
}

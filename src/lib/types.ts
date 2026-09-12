export type Role = 'admin' | 'manager' | 'agent';

export type AgentStatus = 'available' | 'in_call' | 'on_break' | 'offline';

export interface UserPreferences {
  idle_auto_away_minutes: number;
  default_landing_page: '/leads' | '/follow-ups' | '/analytics' | '/team';
  kanban_density: 'compact' | 'expanded';
  instant_whatsapp_direct: boolean;
  default_country_code: string;
}

export interface Profile {
  id: string;
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

export interface EmployeeHealthScore {
  agent_id: string;
  overall_score: number;
  grade: 'elite' | 'healthy' | 'attention_needed' | 'burnout_risk';
  sla_score: number;
  followup_score: number;
  conversion_score: number;
  workload_score: number;
  avg_frt_minutes: number;
  on_time_followup_pct: number;
  active_leads_count: number;
  overdue_tasks_count: number;
  capacity_pct: number;
  last_active_at?: string;
  recommendations: string[];
}

export type ActivityType =
  | 'call'
  | 'whatsapp'
  | 'email'
  | 'note'
  | 'quote'
  | 'payment'
  | 'document'
  | 'stage_change'
  | 'reassignment'
  | 'sla_alert'
  | 'system';

export interface ActivityLog {
  id: string;
  lead_id: string;
  agent_id?: string;
  activity_type: ActivityType;
  title: string;
  outcome?: string;
  notes?: string;
  call_duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  agent?: Profile;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'welcome' | 'quote_followup' | 'discount' | 'reminder' | 'custom';
  message_body: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'AUD' | 'AED';
export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type RoutingStrategy = 'round_robin' | 'workload_balanced' | 'conversion_weighted';
export type RoutingOverflowPolicy = 'unassigned_pool' | 'overflow_available' | 'queue_delay';
export type SoundPreset = 'chime' | 'modern_bell' | 'radar' | 'subtle' | 'off';

export interface AgencySettings {
  id: string;
  // SLA & Business Hours
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

  // Routing Engine
  auto_assign_enabled?: boolean;
  routing_strategy: RoutingStrategy;
  routing_overflow_policy: RoutingOverflowPolicy;
  vip_high_budget_threshold: number;
  vip_route_seniors_only: boolean;
  lead_cooldown_minutes: number;

  // Currency & Financials
  currency: CurrencyCode;
  currency_symbol: string;
  date_format: DateFormat;
  commission_tds_pct: number;
  min_gross_margin_threshold: number;
  payout_frequency: 'monthly' | 'bi-weekly' | 'weekly';

  // Audio & Notifications
  notification_sound_enabled: boolean;
  notification_sound_preset: SoundPreset;
  notification_volume: number;
  mute_sound_in_call: boolean;
  browser_push_enabled: boolean;
  toast_duration_seconds: number;

  // Taxonomies
  custom_lost_reasons: string[];
  custom_lead_sources: string[];
  auto_archive_days: number;
}

export type SlaSettings = AgencySettings;

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'lead_assigned' | 'sla_breach' | 'follow_up_due' | 'reassignment' | 'system';
  link?: string;
  is_read: boolean;
  created_at: string;
}

// Operational & Lifecycle Systems
export type MealPlanCode = 'EP' | 'CP' | 'MAP' | 'AP' | 'AI';

export interface ItineraryDay {
  id: string;
  day_number: number;
  title: string;
  description: string;
  hotel_name?: string;
  meal_plan: MealPlanCode;
  morning_activity?: string;
  afternoon_activity?: string;
  evening_activity?: string;
  activities: string[];
}

export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'stripe' | 'cash' | 'upi' | 'cheque';

export interface PaymentMilestone {
  id: string;
  lead_id: string;
  title: string;
  percentage: number;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue';
  paid_amount?: number;
  paid_at?: string;
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  lead_id: string;
  receipt_number: string;
  amount: number;
  method: PaymentMethod;
  reference_no?: string;
  notes?: string;
  received_at: string;
  created_at: string;
}

export type VisaStatus = 'not_required' | 'visa_on_arrival' | 'applied' | 'approved' | 'rejected';

export interface TravelerPassenger {
  id: string;
  lead_id: string;
  full_name: string;
  type: 'adult' | 'child' | 'infant';
  passport_number?: string;
  passport_country?: string;
  passport_expiry_date?: string;
  is_passport_valid_6months?: boolean;
  visa_status: VisaStatus;
  date_of_birth?: string;
  dietary_preference?: string;
  special_notes?: string;
}

export interface TravelerDocument {
  id: string;
  lead_id: string;
  passenger_id?: string;
  title: string;
  category: 'passport' | 'visa' | 'ticket' | 'hotel_voucher' | 'insurance' | 'other';
  file_name: string;
  file_size?: string;
  uploaded_at: string;
}

export type DmcPaymentStatus = 'unpaid' | 'advance_paid' | 'settled';

export interface DmcSupplier {
  id: string;
  name: string;
  destination: string;
  contact_person: string;
  phone: string;
  email: string;
  currency: string;
  notes?: string;
}

export interface LeadSupplierPayable {
  id: string;
  lead_id: string;
  supplier_name: string;
  service_description: string;
  amount_payable: number;
  amount_paid: number;
  status: DmcPaymentStatus;
  confirmation_voucher_no?: string;
  due_date?: string;
}

export type TripLifecycleStatus = 'planning' | 'booked' | 'pre_departure' | 'on_trip' | 'completed';

export interface PreDepartureChecklist {
  flights_ticketed: boolean;
  hotel_vouchers_issued: boolean;
  passports_verified_6months: boolean;
  visas_confirmed: boolean;
  travel_insurance_issued: boolean;
  web_checkin_completed: boolean;
  emergency_contacts_dispatched: boolean;
}

export interface PostTripReview {
  rating: number;
  nps_score: number;
  feedback_notes?: string;
  repeat_interest?: boolean;
  reviewed_at?: string;
}

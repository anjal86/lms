export type Role = 'admin' | 'manager' | 'agent';
export type WorkspaceRole = 'owner' | Role;

export type AgentStatus = 'available' | 'in_call' | 'on_break' | 'offline';

export interface UserPreferences {
  idle_auto_away_minutes: number;
  default_landing_page: '/dashboard' | '/leads' | '/follow-ups' | '/analytics' | '/team';
  kanban_density: 'compact' | 'expanded';
  instant_whatsapp_direct: boolean;
  default_country_code: string;
  language?: string;
  timezone?: string | null;
  date_format?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | null;
  notification_sound_enabled?: boolean;
  notification_sound_preset?: 'chime' | 'modern_bell' | 'radar' | 'subtle' | 'off';
  notification_volume?: number;
  mute_sound_in_call?: boolean;
  browser_push_enabled?: boolean;
}

export interface Profile {
  id: string;
  workspace_id?: string;
  workspace_role?: WorkspaceRole;
  workspace_permissions?: Record<string, unknown>;
  workspace_joined_at?: string | null;
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
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TEAM_LEAD' | 'AGENT';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
export type LeadStage = 'NEW' | 'CONTACTED' | 'PROPOSAL_SENT' | 'NEGOTIATION' | 'WON' | 'LOST';
export type LeadSource = 'WEBSITE' | 'META_ADS' | 'GOOGLE_ADS' | 'WHATSAPP' | 'REFERRAL' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER';
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TripStatus = 'PLANNED' | 'CONFIRMED' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED';
export type ActivityType = 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'NOTE' | 'STATUS_CHANGE' | 'PROPOSAL';
export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          employee_code: string | null;
          avatar_url: string | null;
          phone: string | null;
          daily_capacity: number;
          status: UserStatus;
          team_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: UserRole;
          employee_code?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          daily_capacity?: number;
          status?: UserStatus;
          team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          employee_code?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          daily_capacity?: number;
          status?: UserStatus;
          team_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      leads: {
        Row: {
          id: string;
          lead_code: string;
          customer_name: string;
          customer_email: string | null;
          customer_phone: string;
          city: string | null;
          destination: string;
          start_date: string | null;
          end_date: string | null;
          duration_days: number | null;
          adults_count: number;
          children_count: number;
          hotel_category: string | null;
          budget_currency: string;
          budget_amount: number;
          stage: LeadStage;
          source: LeadSource;
          priority: PriorityLevel;
          trip_status: TripStatus;
          assigned_agent_id: string | null;
          assigned_at: string | null;
          score: number | null;
          tags: string[] | null;
          notes: string | null;
          lost_reason: string | null;
          lost_competitor: string | null;
          won_revenue: number | null;
          custom_fields: Json | null;
          last_contacted_at: string | null;
          next_follow_up_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_code: string;
          customer_name: string;
          customer_email?: string | null;
          customer_phone: string;
          city?: string | null;
          destination: string;
          start_date?: string | null;
          end_date?: string | null;
          duration_days?: number | null;
          adults_count?: number;
          children_count?: number;
          hotel_category?: string | null;
          budget_currency?: string;
          budget_amount?: number;
          stage?: LeadStage;
          source?: LeadSource;
          priority?: PriorityLevel;
          trip_status?: TripStatus;
          assigned_agent_id?: string | null;
          assigned_at?: string | null;
          score?: number | null;
          tags?: string[] | null;
          notes?: string | null;
          lost_reason?: string | null;
          lost_competitor?: string | null;
          won_revenue?: number | null;
          custom_fields?: Json | null;
          last_contacted_at?: string | null;
          next_follow_up_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_code?: string;
          customer_name?: string;
          customer_email?: string | null;
          customer_phone?: string;
          city?: string | null;
          destination?: string;
          start_date?: string | null;
          end_date?: string | null;
          duration_days?: number | null;
          adults_count?: number;
          children_count?: number;
          hotel_category?: string | null;
          budget_currency?: string;
          budget_amount?: number;
          stage?: LeadStage;
          source?: LeadSource;
          priority?: PriorityLevel;
          trip_status?: TripStatus;
          assigned_agent_id?: string | null;
          assigned_at?: string | null;
          score?: number | null;
          tags?: string[] | null;
          notes?: string | null;
          lost_reason?: string | null;
          lost_competitor?: string | null;
          won_revenue?: number | null;
          custom_fields?: Json | null;
          last_contacted_at?: string | null;
          next_follow_up_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      follow_ups: {
        Row: {
          id: string;
          lead_id: string;
          agent_id: string;
          due_date: string;
          title: string;
          notes: string | null;
          priority: PriorityLevel;
          status: FollowUpStatus;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          agent_id: string;
          due_date: string;
          title: string;
          notes?: string | null;
          priority?: PriorityLevel;
          status?: FollowUpStatus;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          agent_id?: string;
          due_date?: string;
          title?: string;
          notes?: string | null;
          priority?: PriorityLevel;
          status?: FollowUpStatus;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      activities: {
        Row: {
          id: string;
          lead_id: string;
          agent_id: string | null;
          type: ActivityType;
          title: string;
          description: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          agent_id?: string | null;
          type: ActivityType;
          title: string;
          description?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          agent_id?: string | null;
          type?: ActivityType;
          title?: string;
          description?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      crm_settings: {
        Row: {
          id: string;
          company_name: string;
          sla_response_time_minutes: number;
          auto_assign_enabled: boolean;
          round_robin_strategy: string;
          working_hours: Json | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name?: string;
          sla_response_time_minutes?: number;
          auto_assign_enabled?: boolean;
          round_robin_strategy?: string;
          working_hours?: Json | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_name?: string;
          sla_response_time_minutes?: number;
          auto_assign_enabled?: boolean;
          round_robin_strategy?: string;
          working_hours?: Json | null;
          updated_at?: string;
        };
      };
    };
  };
}

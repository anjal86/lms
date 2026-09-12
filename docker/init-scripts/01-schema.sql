-- ==============================================================================
-- TRAVEL LEADS MANAGEMENT SYSTEM (LMS) - SCHEMA INITIALIZATION
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. PROFILES (Employees: Admins, Managers, Travel Consultants/Agents)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_code TEXT,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'agent')) DEFAULT 'agent',
    phone TEXT,
    direct_extension TEXT,
    avatar_url TEXT,
    destination_tags TEXT[] DEFAULT '{}', -- e.g. ARRAY['Bali', 'Thailand', 'Europe', 'Dubai']
    max_capacity INTEGER DEFAULT 25,       -- Maximum concurrent active leads
    current_load INTEGER DEFAULT 0,       -- Currently active leads count
    status TEXT NOT NULL CHECK (status IN ('available', 'in_call', 'on_break', 'offline')) DEFAULT 'available',
    is_active BOOLEAN DEFAULT true,
    accepting_leads BOOLEAN DEFAULT true,
    bio TEXT,
    languages TEXT[] DEFAULT '{"English"}',
    office_location TEXT DEFAULT 'San Francisco HQ',
    certifications TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on role & status for fast round-robin queries
CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON public.profiles(role, status, is_active);

-- ------------------------------------------------------------------------------
-- 2. LEADS (Travel Inquiries & Pipeline)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_code TEXT UNIQUE, -- e.g. TRV-2026-001
    
    -- Customer Information
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT NOT NULL,
    customer_city TEXT,
    customer_country TEXT DEFAULT 'India',
    
    -- Travel Requirements
    destination TEXT NOT NULL,
    travel_dates TEXT,           -- e.g. "2026-10-15 to 2026-10-22" or "Nov 2026"
    duration_days INTEGER DEFAULT 5,
    pax_adults INTEGER DEFAULT 2,
    pax_children INTEGER DEFAULT 0,
    pax_infants INTEGER DEFAULT 0,
    travel_type TEXT DEFAULT 'family', -- honeymoon, family, luxury, adventure, corporate, budget
    budget_range TEXT,                 -- e.g. "$1,500 - $2,500"
    hotel_category TEXT DEFAULT '4-star', -- 3-star, 4-star, 5-star, luxury resort
    flight_required BOOLEAN DEFAULT true,
    visa_required BOOLEAN DEFAULT false,
    special_notes TEXT,
    source TEXT DEFAULT 'website',     -- website, meta_ads, google_ads, referral, walk_in, whatsapp
    
    -- Pipeline & Stage
    stage TEXT NOT NULL CHECK (stage IN ('new', 'contacted', 'quote_sent', 'in_negotiation', 'won', 'lost', 'junk')) DEFAULT 'new',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
    
    -- Assignment & Ownership
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- SLA Tracking & Timers
    first_response_due_at TIMESTAMPTZ,     -- e.g., assigned_at + 30 minutes
    first_contacted_at TIMESTAMPTZ,        -- when first call/WhatsApp was logged
    first_response_time_seconds INTEGER,   -- elapsed seconds between assign and first contact
    is_first_response_breached BOOLEAN DEFAULT false,
    
    next_follow_up_at TIMESTAMPTZ,         -- next scheduled action date/time
    last_contacted_at TIMESTAMPTZ,
    last_activity_type TEXT,               -- 'call', 'whatsapp', 'email', 'note'
    
    -- Conversion / Closure & Profit Tracking
    won_deal_value NUMERIC(12, 2),
    package_sale_price NUMERIC(12, 2),
    vendor_net_cost NUMERIC(12, 2),
    gross_profit NUMERIC(12, 2),
    profit_margin_pct NUMERIC(5, 2),
    agent_commission_earned NUMERIC(12, 2),
    commission_status TEXT CHECK (commission_status IN ('accrued', 'approved', 'paid')) DEFAULT 'accrued',
    lost_reason TEXT,                      -- 'budget_too_high', 'competitor', 'dates_changed', 'no_response', etc.
    lost_notes TEXT,
    closed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON public.leads(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_leads_destination ON public.leads(destination);

-- ------------------------------------------------------------------------------
-- 3. FOLLOW-UPS (Task Management & Reminders)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('call', 'whatsapp', 'email', 'meeting')) DEFAULT 'call',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')) DEFAULT 'pending',
    notes TEXT,
    completion_notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_agent_status ON public.follow_ups(assigned_to, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_lead ON public.follow_ups(lead_id);

-- ------------------------------------------------------------------------------
-- 4. ACTIVITY LOGS (Chronological Audit Trail & Interaction History)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('call', 'whatsapp', 'email', 'note', 'stage_change', 'reassignment', 'sla_alert', 'system')),
    title TEXT NOT NULL,
    outcome TEXT,           -- e.g. 'Interested', 'Call Back Later', 'Did Not Answer', 'Quote Sent', 'Won', 'Lost'
    notes TEXT,
    call_duration_seconds INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead ON public.activity_logs(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_agent ON public.activity_logs(agent_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. WHATSAPP TEMPLATES (Dynamic 1-Click Message Presets)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT DEFAULT 'general', -- 'welcome', 'quote_followup', 'discount', 'reminder'
    message_body TEXT NOT NULL,      -- Can contain {{customer_name}}, {{destination}}, {{agent_name}}, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. SLA SETTINGS (Configurable Business Rules)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sla_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frt_minutes INTEGER DEFAULT 30,                -- First response time limit in minutes
    overdue_grace_minutes INTEGER DEFAULT 60,      -- Follow-up overdue threshold
    escalate_to_manager BOOLEAN DEFAULT true,
    auto_reassign_breached_leads BOOLEAN DEFAULT false,
    auto_reassign_hours INTEGER DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 7. NOTIFICATIONS (In-App Live Alerts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('lead_assigned', 'sla_breach', 'follow_up_due', 'reassignment', 'system')),
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- ------------------------------------------------------------------------------
-- 8. TRIGGERS & BUSINESS LOGIC FUNCTIONS
-- ------------------------------------------------------------------------------

-- Auto-generate lead code TRV-YYYY-XXXX
CREATE OR REPLACE FUNCTION public.fn_generate_lead_code()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
BEGIN
    IF NEW.lead_code IS NULL THEN
        SELECT COALESCE(MAX(SUBSTRING(lead_code FROM 10)::INTEGER), 0) + 1 
        INTO next_num
        FROM public.leads
        WHERE lead_code LIKE 'TRV-' || TO_CHAR(NOW(), 'YYYY') || '-%';
        
        NEW.lead_code := 'TRV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_num::TEXT, 4, '0');
    END IF;
    
    -- Set default first response due date (assigned_at + 30 mins) if not set
    IF NEW.first_response_due_at IS NULL AND NEW.assigned_to IS NOT NULL THEN
        NEW.first_response_due_at := COALESCE(NEW.assigned_at, NOW()) + INTERVAL '30 minutes';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_lead_code ON public.leads;
CREATE TRIGGER trg_generate_lead_code
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.fn_generate_lead_code();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_timestamp();

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone authenticated can view profiles; only self or admin can update
CREATE POLICY "Profiles viewable by all authenticated" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Profiles updatable by admin or self" ON public.profiles
    FOR UPDATE USING (auth.uid() = id OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ));

-- Leads:
-- Admin & Manager: full access to all leads
-- Agents: can view and update only leads assigned to them or unassigned leads
CREATE POLICY "Leads access policy" ON public.leads
    FOR ALL USING (
        -- If no auth uid (service role / local dev without auth), allow
        auth.uid() IS NULL 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
        OR assigned_to = auth.uid()
        OR assigned_to IS NULL
    );

-- Follow-ups:
CREATE POLICY "Follow ups access policy" ON public.follow_ups
    FOR ALL USING (
        auth.uid() IS NULL 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
        OR assigned_to = auth.uid()
    );

-- Activity Logs:
CREATE POLICY "Activity logs access policy" ON public.activity_logs
    FOR ALL USING (true);

-- Templates & Settings:
CREATE POLICY "Templates viewable by all" ON public.whatsapp_templates
    FOR SELECT USING (true);

CREATE POLICY "Templates modifiable by admin" ON public.whatsapp_templates
    FOR ALL USING (
        auth.uid() IS NULL 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "SLA settings viewable by all" ON public.sla_settings
    FOR SELECT USING (true);

CREATE POLICY "SLA settings modifiable by admin" ON public.sla_settings
    FOR ALL USING (
        auth.uid() IS NULL 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Notifications access policy" ON public.notifications
    FOR ALL USING (
        auth.uid() IS NULL 
        OR user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ------------------------------------------------------------------------------
-- 10. INCENTIVE TIERS (Commission & Profit Ladders)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incentive_tiers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    min_profit_threshold NUMERIC(12, 2) NOT NULL,
    max_profit_threshold NUMERIC(12, 2), -- NULL means unbounded
    commission_pct NUMERIC(5, 2) NOT NULL,
    bonus_reward NUMERIC(12, 2) DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#71717a',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.incentive_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Incentive tiers viewable by all" ON public.incentive_tiers FOR SELECT USING (true);
CREATE POLICY "Incentive tiers editable by admin" ON public.incentive_tiers FOR ALL USING (
    auth.uid() IS NULL OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

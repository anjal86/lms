-- ==============================================================================
-- TRAVEL LEADS MANAGEMENT SYSTEM (LMS) - SEED DATA
-- ==============================================================================

-- 1. Insert Team Profiles
INSERT INTO public.profiles (
    id, employee_code, email, full_name, role, phone, direct_extension,
    destination_tags, max_capacity, current_load, status, is_active, accepting_leads,
    bio, languages, office_location
) VALUES
    ('11111111-1111-1111-1111-111111111111', 'TRV-ADM-001', 'admin@travellms.com', 'Sarah Jenkins', 'admin', '+14155550100', 'Ext. 101', ARRAY['Global', 'VIP Luxury', 'Executive'], 50, 0, 'available', true, false, 'Agency founder & operations head. Oversees company-wide SLAs and VIP client escalations.', ARRAY['English', 'Spanish'], 'San Francisco HQ'),
    ('22222222-2222-2222-2222-222222222222', 'TRV-MGR-002', 'manager@travellms.com', 'David Miller', 'manager', '+14155550101', 'Ext. 102', ARRAY['All Teams', 'Escalations', 'Group Charters'], 40, 0, 'available', true, false, 'Sales Director overseeing consultant performance, round-robin lead allocation, and monthly profit margins.', ARRAY['English', 'German'], 'San Francisco HQ'),
    ('33333333-3333-3333-3333-333333333333', 'TRV-AGT-003', 'alex@travellms.com', 'Alex Rivera', 'agent', '+14155550102', 'Ext. 103', ARRAY['Bali', 'Thailand', 'Vietnam', 'Singapore', 'Asia'], 25, 4, 'available', true, true, 'Southeast Asia specialist focusing on luxury honeymoons, private villa stays in Ubud & Seminyak, and exotic multi-city tours.', ARRAY['English', 'Spanish'], 'Remote - West Coast'),
    ('44444444-4444-4444-4444-444444444444', 'TRV-AGT-004', 'emma@travellms.com', 'Emma Watson', 'agent', '+14155550103', 'Ext. 104', ARRAY['Switzerland', 'Paris', 'Italy', 'Europe', 'Greece'], 25, 3, 'in_call', true, true, 'European grand tour curator. Specializes in Swiss panoramic trains, romantic Parisian boutique getaways, and Amalfi Coast charters.', ARRAY['English', 'French', 'Italian'], 'Remote - East Coast'),
    ('55555555-5555-5555-5555-555555555555', 'TRV-AGT-005', 'michael@travellms.com', 'Michael Chang', 'agent', '+14155550104', 'Ext. 105', ARRAY['Dubai', 'Maldives', 'Mauritius', 'Egypt', 'Middle East'], 25, 3, 'available', true, true, 'Middle East & Indian Ocean bespoke designer. Expert in overwater Maldives resorts, Dubai desert glamping, and private Nile River cruises.', ARRAY['English', 'Mandarin'], 'San Francisco HQ')
ON CONFLICT (id) DO NOTHING;

-- 2. Insert WhatsApp Templates
INSERT INTO public.whatsapp_templates (name, category, message_body, is_active)
VALUES
    ('Initial Welcome & Trip Inquiry', 'welcome', 'Hi {{customer_name}}, thank you for reaching out to Wanderlust Travel! ✈️ This is {{agent_name}}, your dedicated travel planner for {{destination}}. I saw your inquiry for a {{pax_count}} trip. Could you let me know if your travel dates are flexible so I can send the best hotel options?', true),
    ('Custom Itinerary & Quote Sent', 'quote_followup', 'Hello {{customer_name}}! 🌴 I have prepared a customized itinerary for your {{destination}} holiday. I have emailed the full PDF and price breakdown. Have you had a chance to review it? I can also adjust the resort or activities according to your preference.', true),
    ('Urgent Special Price Lock', 'discount', 'Hi {{customer_name}}, quick update! 🌟 The airline and resort in {{destination}} currently have a 15% discount valid for the next 48 hours. If we lock it in today, we can save you approximately $350 on your package. Would you like to proceed with the reservation?', true),
    ('Visa & Travel Documents Check', 'reminder', 'Hi {{customer_name}}, just checking in regarding the visa requirements for {{destination}}. We provide complimentary visa document verification. Let me know when is a good time for a quick 5-minute call today!', true)
ON CONFLICT DO NOTHING;

-- 3. Insert SLA Settings
INSERT INTO public.sla_settings (frt_minutes, overdue_grace_minutes, escalate_to_manager, auto_reassign_breached_leads, auto_reassign_hours)
VALUES (30, 60, true, false, 4)
ON CONFLICT DO NOTHING;

-- 4. Insert Travel Leads
INSERT INTO public.leads (
    id, lead_code, customer_name, customer_email, customer_phone, customer_city, customer_country,
    destination, travel_dates, duration_days, pax_adults, pax_children, pax_infants, travel_type,
    budget_range, hotel_category, flight_required, visa_required, special_notes, source,
    stage, priority, assigned_to, assigned_at, first_response_due_at, first_contacted_at,
    first_response_time_seconds, is_first_response_breached, next_follow_up_at, last_contacted_at, last_activity_type,
    won_deal_value, package_sale_price, vendor_net_cost, gross_profit, profit_margin_pct, agent_commission_earned, commission_status, lost_reason
) VALUES
-- LEAD 1: Brand new lead, Bali (Alex) - SLA countdown active! (15 mins left)
(
    'a1111111-0000-0000-0000-000000000001', 'TRV-2026-0001', 'Rohan Sharma', 'rohan.sharma@gmail.com', '+919876543210', 'Mumbai', 'India',
    'Bali', '2026-11-10 to 2026-11-17', 7, 2, 0, 0, 'honeymoon',
    '$2,000 - $3,000', '5-star', true, true, 'Wants private pool villa in Seminyak and Ubud swing tour', 'website',
    'new', 'urgent', '33333333-3333-3333-3333-333333333333', NOW() - INTERVAL '15 minutes', NOW() + INTERVAL '15 minutes', NULL,
    NULL, false, NOW() + INTERVAL '15 minutes', NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 2: New lead, Breached SLA! (Assigned 45 mins ago, no response yet) -> Overdue warning
(
    'a1111111-0000-0000-0000-000000000002', 'TRV-2026-0002', 'Jessica Taylor', 'jessica.t@outlook.com', '+14155552345', 'San Francisco', 'USA',
    'Switzerland', '2026-12-20 to 2026-12-28', 8, 2, 2, 0, 'family',
    '$6,000 - $8,000', '4-star', true, false, 'Christmas ski trip, Zermatt & Interlaken, Swiss Travel Pass', 'meta_ads',
    'new', 'high', '44444444-4444-4444-4444-444444444444', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '15 minutes', NULL,
    NULL, true, NOW() - INTERVAL '15 minutes', NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 3: Contacted, Dubai (Michael) - Next follow-up due in 2 hours
(
    'a1111111-0000-0000-0000-000000000003', 'TRV-2026-0003', 'Ahmed Al-Mansoor', 'ahmed.m@company.ae', '+971501234567', 'Abu Dhabi', 'UAE',
    'Dubai', '2026-10-05 to 2026-10-10', 5, 4, 1, 0, 'luxury',
    '$4,500 - $6,000', '5-star', false, false, 'Atlantis The Royal stay + VIP Desert Safari with private falconry', 'google_ads',
    'contacted', 'high', '55555555-5555-5555-5555-555555555555', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours 30 minutes', NOW() - INTERVAL '2 hours 40 minutes',
    1200, false, NOW() + INTERVAL '2 hours', NOW() - INTERVAL '2 hours 40 minutes', 'call',
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 4: Quote Sent, Overdue follow-up! (Scheduled for yesterday)
(
    'a1111111-0000-0000-0000-000000000004', 'TRV-2026-0004', 'Ananya Patel', 'ananya.p@yahoo.com', '+919820011223', 'Delhi', 'India',
    'Maldives', '2026-11-01 to 2026-11-06', 5, 2, 0, 0, 'honeymoon',
    '$3,500 - $5,000', 'luxury resort', true, false, 'Water villa with all-inclusive meal plan, seaplane transfer', 'referral',
    'quote_sent', 'urgent', '55555555-5555-5555-5555-555555555555', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days',
    900, false, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day 4 hours', 'whatsapp',
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 5: In Negotiation, Europe (Emma) - Follow up scheduled for today at 3 PM
(
    'a1111111-0000-0000-0000-000000000005', 'TRV-2026-0005', 'Carlos Gomez', 'cgomez@techcorp.es', '+34612345678', 'Madrid', 'Spain',
    'Paris & Italy', '2026-10-18 to 2026-10-28', 10, 2, 0, 0, 'honeymoon',
    '$5,000 - $7,000', '4-star', true, false, 'Colosseum skip-the-line, Eiffel Tower dinner, high speed train booked', 'website',
    'in_negotiation', 'high', '44444444-4444-4444-4444-444444444444', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days',
    600, false, NOW() + INTERVAL '4 hours', NOW() - INTERVAL '18 hours', 'call',
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 6: Won Lead! Bali (Alex Rivera)
(
    'a1111111-0000-0000-0000-000000000006', 'TRV-2026-0006', 'Priya & Vikram Nair', 'vikram.nair@gmail.com', '+919988776655', 'Bangalore', 'India',
    'Bali', '2026-10-02 to 2026-10-08', 6, 2, 0, 0, 'honeymoon',
    '$2,800', '5-star', true, true, 'Deposit received ($800). Flights and Ayana Resort confirmed.', 'website',
    'won', 'normal', '33333333-3333-3333-3333-333333333333', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days',
    480, false, NULL, NOW() - INTERVAL '1 day', 'call',
    2800.00, 2800.00, 2100.00, 700.00, 25.0, 42.00, 'approved', NULL
),
-- LEAD 7: Lost Lead (Budget Mismatch) - Thailand (Alex)
(
    'a1111111-0000-0000-0000-000000000007', 'TRV-2026-0007', 'David O''Connor', 'doconnor@irishmail.ie', '+353871234567', 'Dublin', 'Ireland',
    'Thailand', '2026-11-15 to 2026-11-22', 7, 4, 0, 0, 'budget',
    '$800 - $1,000', '3-star', true, false, 'Expected all-inclusive with international flights under $1,000 for 4 pax.', 'meta_ads',
    'lost', 'low', '33333333-3333-3333-3333-333333333333', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days',
    750, false, NULL, NOW() - INTERVAL '2 days', 'call',
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', 'budget_too_high'
),
-- LEAD 8: Unassigned Lead, Japan (Waiting for round robin or manager allocation)
(
    'a1111111-0000-0000-0000-000000000008', 'TRV-2026-0008', 'Marcus Vance', 'marcus.vance@venture.com', '+12125559876', 'New York', 'USA',
    'Japan', '2026-11-20 to 2026-12-02', 12, 2, 1, 0, 'luxury',
    '$10,000 - $15,000', 'luxury resort', true, false, 'Tokyo, Kyoto Ryokan with private Onsen, bullet train green car pass', 'website',
    'new', 'urgent', NULL, NULL, NULL, NULL,
    NULL, false, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 9: Contacted, Greece (Emma)
(
    'a1111111-0000-0000-0000-000000000009', 'TRV-2026-0009', 'Sophie Martin', 'smartin@parisart.fr', '+33611223344', 'Lyon', 'France',
    'Greece', '2026-10-12 to 2026-10-19', 7, 2, 0, 0, 'family',
    '$3,000 - $4,200', '4-star', true, false, 'Santorini sunset cruise + Mykonos beach club reservations', 'google_ads',
    'contacted', 'normal', '44444444-4444-4444-4444-444444444444', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day',
    800, false, NOW() + INTERVAL '1 day', NOW() - INTERVAL '6 hours', 'whatsapp',
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 10: In Negotiation, Egypt & Nile Cruise (Michael)
(
    'a1111111-0000-0000-0000-000000000010', 'TRV-2026-0010', 'Robert Kowalski', 'robert.k@poltrans.pl', '+48601234567', 'Warsaw', 'Poland',
    'Egypt', '2026-12-01 to 2026-12-08', 7, 2, 0, 0, 'adventure',
    '$2,500 - $3,500', '4-star', true, true, 'Cairo pyramids + 4-night luxury Nile Cruise from Luxor to Aswan', 'referral',
    'in_negotiation', 'high', '55555555-5555-5555-5555-555555555555', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days',
    420, false, NOW() + INTERVAL '5 hours', NOW() - INTERVAL '12 hours', 'call',
    NULL, NULL, NULL, NULL, NULL, NULL, 'accrued', NULL
),
-- LEAD 11: Won Lead! Swiss Alps Grand Tour (Emma Watson)
(
    'a1111111-0000-0000-0000-000000000011', 'TRV-2026-0011', 'Helena & Mark Lindqvist', 'mark.l@nordic.se', '+46701234567', 'Stockholm', 'Sweden',
    'Switzerland', '2026-09-01 to 2026-09-10', 9, 2, 0, 0, 'luxury',
    '$14,000', '5-star', true, false, 'First-class Glacier Express + Chedi Andermatt booked.', 'website',
    'won', 'normal', '44444444-4444-4444-4444-444444444444', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days',
    350, false, NULL, NOW() - INTERVAL '2 days', 'call',
    14200.00, 14200.00, 10800.00, 3400.00, 23.9, 442.00, 'paid', NULL
),
-- LEAD 12: Won Lead! Dubai Ultra Luxury (Michael Chang)
(
    'a1111111-0000-0000-0000-000000000012', 'TRV-2026-0012', 'Tariq Mansoor', 'tmansoor@gulfinv.com', '+971509988776', 'Dubai', 'UAE',
    'Dubai', '2026-08-20 to 2026-08-27', 7, 4, 2, 0, 'family',
    '$18,500', 'luxury resort', true, false, 'Burj Al Arab Presidential Suite + Yacht charter.', 'referral',
    'won', 'normal', '55555555-5555-5555-5555-555555555555', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days',
    240, false, NULL, NOW() - INTERVAL '3 days', 'whatsapp',
    18500.00, 18500.00, 14000.00, 4500.00, 24.3, 585.00, 'approved', NULL
)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Scheduled Follow-ups
INSERT INTO public.follow_ups (id, lead_id, assigned_to, title, scheduled_at, channel, priority, status, notes)
VALUES
    -- Overdue follow-up for Maldives
    ('f1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555', 'Call to discuss water villa upgrade options', NOW() - INTERVAL '1 day', 'call', 'urgent', 'missed', 'Client was waiting for husband to review Maldives seaplane times'),
    -- Today's follow-up for Europe
    ('f1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444', 'Send revised Paris hotel quote with balcony view', NOW() + INTERVAL '4 hours', 'whatsapp', 'high', 'pending', 'Customer requested 4-star hotel closer to metro line 1'),
    -- Today's follow-up for Dubai
    ('f1111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555', 'Confirm Desert Safari private car availability', NOW() + INTERVAL '2 hours', 'call', 'high', 'pending', 'Check if land cruiser can pick up from Dubai Marina hotel'),
    -- Today's follow-up for Egypt
    ('f1111111-0000-0000-0000-000000000004', 'a1111111-0000-0000-0000-000000000010', '55555555-5555-5555-5555-555555555555', 'Follow up on Nile cruise cabin preference', NOW() + INTERVAL '5 hours', 'email', 'normal', 'pending', 'Upper deck cabin option quoted')
ON CONFLICT (id) DO NOTHING;

-- 6. Insert Activity Logs
INSERT INTO public.activity_logs (lead_id, agent_id, activity_type, title, outcome, notes, call_duration_seconds, created_at)
VALUES
    ('a1111111-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555', 'call', 'Initial Consultation Call', 'Interested', 'Spoke with Mr. Ahmed. Very keen on Atlantis The Royal for 5 nights. Traveling with family (4 adults, 1 child). Sent preliminary options.', 380, NOW() - INTERVAL '2 hours 40 minutes'),
    ('a1111111-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555', 'whatsapp', 'Sent Maldives PDF Quote', 'Quote Sent', 'Shared detailed PDF itinerary with Adaaran Prestige Vadoo and Sun Siyam Olhuveli.', NULL, NOW() - INTERVAL '1 day 4 hours'),
    ('a1111111-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444', 'call', 'Negotiation Call on Europe Rail Passes', 'Call Back Later', 'Discussed Eurail Pass vs Point-to-Point tickets. Carlos prefers high-speed Frecciarossa tickets. Will email revised quote today.', 420, NOW() - INTERVAL '18 hours'),
    ('a1111111-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'stage_change', 'Deal Won - Deposit Received', 'Won', 'Client made initial deposit of $800. Vouchers issued.', NULL, NOW() - INTERVAL '1 day'),
    ('a1111111-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'call', 'Budget Clarification', 'Lost', 'Client has unrealistic budget of $900 total for 4 adults including flights from Dublin. Marked as lost due to budget mismatch.', 180, NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- 7. Insert Notifications
INSERT INTO public.notifications (user_id, title, message, type, link)
VALUES
    ('33333333-3333-3333-3333-333333333333', 'New High-Priority Lead Assigned', 'Rohan Sharma has requested a Bali honeymoon package ($2k - $3k). SLA response due in 15 mins!', 'lead_assigned', '/leads/a1111111-0000-0000-0000-000000000001'),
    ('44444444-4444-4444-4444-444444444444', '⚠️ SLA First Response Breached!', 'Jessica Taylor (Switzerland family ski trip) has not been contacted within 30 minutes.', 'sla_breach', '/leads/a1111111-0000-0000-0000-000000000002'),
    ('22222222-2222-2222-2222-222222222222', 'Manager Alert: SLA Breach on Team Europe', 'Agent Emma Watson has an uncontacted lead past the 30-minute threshold.', 'sla_breach', '/leads/a1111111-0000-0000-0000-000000000002'),
    ('55555555-5555-5555-5555-555555555555', 'Overdue Follow-up Reminder', 'Ananya Patel (Maldives quote) follow-up was due yesterday. Please contact customer today.', 'follow_up_due', '/leads/a1111111-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- 8. Insert Incentive Tiers
INSERT INTO public.incentive_tiers (id, name, min_profit_threshold, max_profit_threshold, commission_pct, bonus_reward, color)
VALUES
    ('tier-1', 'Bronze Starter', 0, 5000, 6.0, 0, '#a1a1aa'),
    ('tier-2', 'Silver Producer', 5000, 12000, 9.0, 150, '#94a3b8'),
    ('tier-3', 'Gold Elite', 12000, 25000, 13.0, 350, '#f59e0b'),
    ('tier-4', 'Platinum Champion', 25000, NULL, 18.0, 750, '#8b5cf6')
ON CONFLICT (id) DO NOTHING;

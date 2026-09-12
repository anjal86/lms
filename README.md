# Wanderlust Travel LMS - Travel Leads Management System

A production-grade Travel Leads Management System (CRM) engineered with a laser focus on **employee accountability, smart round-robin lead distribution, structured follow-up cadences, and SLA enforcement**.

---

## 🌟 Key Features

### 1. 3-Tier Role Hierarchy & Privacy
- **Super Admin**: Global SLA configuration, full pipeline visibility, team roster management, audit logs.
- **Sales Manager / Team Lead**: Real-time team monitoring, SLA breach alerts, manual lead reassignment, employee performance leaderboard.
- **Travel Consultants / Agents**: Dedicated personal workbench. In accordance with strict lead privacy, agents only see their assigned inquiries (or unassigned queue).
- **1-Click Demo Role Switcher**: Instant switching in the top bar between Super Admin (Sarah), Sales Manager (David), and 3 Travel Specialists (Alex - Bali/Asia, Emma - Europe/Luxury, Michael - Dubai/Middle East).

### 2. Smart Hybrid Lead Distribution
- Automatically routes incoming leads to active travel consultants based on:
  1. **Destination Specialization Tag** (e.g. Bali, Europe, Dubai, Maldives).
  2. **Live Routing Availability** (`Available`, `In Call`, `On Break`, `Offline`).
  3. **Capacity & Current Workload** (assigns to the specialist with the lowest active lead load).
- Managers and Admins retain full manual override and bulk reassignment capabilities.

### 3. Structured Follow-up Cadence & Live SLA Timers
- **First Response Time (FRT) SLA**:
  - Live countdown timer badge on every new lead (default target: &lt;30 minutes).
  - Turns pulsing amber when under 10 minutes remain.
  - Flashes red with breach duration if neglected.
  - Automatically notifies the sales manager when breached.
- **Next Follow-Up Due Engine**:
  - Highlights leads with overdue scheduled calls in red.
  - One-click rescheduling shortcuts (`+2 hrs`, `Tomorrow 10 AM`, `+3 days`).
- **First Contact Resolution**:
  - Logging the first call or sending a WhatsApp template automatically computes the exact response time in seconds, clears the pending SLA timer, and transitions the lead to the "Contacted" stage.

### 4. 1-Click Communication & Activity Logging
- **1-Click WhatsApp Proposal (`wa.me`)**:
  - Opens WhatsApp Web or desktop app directly with pre-filled, personalized travel proposals.
  - Dynamic tags auto-replaced: `{{customer_name}}`, `{{destination}}`, `{{agent_name}}`, `{{pax_count}}`.
- **1-Click Phone Call & Quick-Log Modal**:
  - Fast modal to select call disposition (*Interested*, *Call Back Later*, *Budget Mismatch*, *No Answer*), duration, notes, and schedule the next follow-up in a single step.
- **Full Chronological Timeline**:
  - Every call, WhatsApp chat, note, stage progression, and reassignment is audited with timestamps and agent attribution.

### 5. Follow-Ups Command Center
- Dedicated daily agenda tabbed into **Overdue Tasks (Alert)**, **Due Today**, **Upcoming This Week**, and **Completed Follow-ups**.
- Quick completion check-off and rapid reschedule chips.

### 6. Employee Performance & Productivity Suite
- **Interactive Leaderboard**:
  - Rankings by Confirmed Bookings / Deals Won, Average First Response Time (FRT), Win Rate %, and Gross Revenue.
  - Tracks total calls and WhatsApp interactions logged.
  - SLA compliance rate and breach counts.
- **Lost Inquiries Pareto Analysis**:
  - Visual breakdown of loss reasons (*Budget too high*, *Competitor*, *Unresponsive*, *Dates changed*).

### 7. Multi-Channel Lead Ingestion
- **Quick-Add Lead Modal**: Comprehensive travel fields (Pax breakdown, hotel preference, flight/visa checkboxes, budget, travel style).
- **Bulk CSV Importer**: Upload or paste CSV lead batches with auto-routing.
- **Public REST Webhook API**: Secure `POST /api/leads/webhook` for WordPress, Elementor, Webflow, Meta Ads, and Zapier.

---

## 🚀 Quick Start

### 1. Start the Next.js Web App
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Start Local Self-Hosted Supabase (Docker)
In a terminal with Docker Desktop or WSL running:
```bash
cd docker
docker compose up -d
```
- **Supabase Studio GUI**: [http://localhost:54323](http://localhost:54323)
- **API Gateway**: [http://localhost:8000](http://localhost:8000)
- The database is automatically seeded with 5 staff profiles, 10+ realistic travel leads, WhatsApp templates, and SLA rules via `docker/init-scripts/`.

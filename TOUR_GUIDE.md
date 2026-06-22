# NEXORA — Client Tour Guide

---

## What is NEXORA?

NEXORA is a banquet revenue operating system built for hotels. It replaces scattered WhatsApp chats, Excel sheets, and offline diaries with one platform that captures every lead, follows up automatically, tracks every campaign, and shows you exactly where your banquet revenue is coming from.

**The core promise:** A new banquet inquiry arrives → NEXORA captures it → WhatsApp auto-reply goes out within 90 seconds → 7-day follow-up runs automatically → proposal gets sent → booking confirmed. Zero manual work.

---

## 1. Login & Roles

Three user roles, each with different access:

| Role | Who uses it | What they can do |
|---|---|---|
| **Owner** | Hotel owner / GM | Everything — settings, users, all data |
| **Manager** | Banquet sales manager | All lead, campaign, proposal operations |
| **Executive** | Sales coordinator | View and update leads, log activities |

Login at `/login` with email + password. Every route is protected — if you're not logged in, you get redirected automatically.

---

## 2. Dashboard

The first thing you see after login. Everything here is calculated from real data — nothing is hardcoded.

**What's on the dashboard:**
- **KPI cards** — Total leads, new leads this month, active pipeline value, bookings confirmed
- **Stage distribution** — Visual breakdown of how many leads are at each stage (New → Booked)
- **30-day trend chart** — Leads, proposals, and bookings plotted day by day
- **Overdue leads widget** — Highlights leads that need immediate attention:
  - NEW leads with no contact in 24+ hours (amber)
  - FOLLOW-UP leads with no activity in 72+ hours (orange)
  - PROPOSAL SENT leads with no update in 5+ days (red)
  - Each row links directly to that lead

The dashboard tells you in 10 seconds whether your banquet operation is healthy or not.

---

## 3. Leads — The Core of the System

Path: `/leads`

### Lead Sources
Leads come in from:
- **Google Sheets sync** (website form, Meta ads, Google Ads, manual ops sheets)
- **CSV import** (bulk upload historical leads)
- **Manual entry** (walk-in, phone inquiry, referral)

Every lead is tagged with its source automatically.

### Lead List
- Search by name, phone, or email
- Filter by **stage**, **event type**, **source**
- Leads older than 24 hours in NEW stage show an amber `⚠ Xh old` SLA badge
- Click any lead to open the detail page

### Lead Detail Page
Everything about one lead in one place:

**Left side — Lead info:**
- Contact: name, phone, email
- Event details: type, date, guest count, budget (₹ lakhs)
- Source, lead score (0–100), assigned team member
- Edit button to update any field inline

**Right side — Activity Timeline:**
Every action logged in chronological order:
- Stage changes (who changed it, when)
- Notes added by team
- WhatsApp messages sent (manual + automated)
- Proposals created and sent
- Tasks created and completed

### Stage Lifecycle
Move a lead through stages using the dropdown — each change is logged automatically:

```
New → Contacted → Follow-Up → Site Visit → Proposal Sent → Negotiation → Booked / Lost
```

### Tasks
Add follow-up tasks on any lead with a due date and priority (Low / Medium / High / Urgent). Mark complete from the same page. Task creation and completion both log in the timeline.

### WhatsApp from Lead Detail
"Send via WhatsApp" panel — pre-fills a message with the lead's name, sends directly, logs as activity.

---

## 4. Google Sheets Integration — Lead Ingestion

Path: `/settings/integrations`

This is how leads flow in automatically from your existing sources.

**How it works:**
1. You (or the client) has a Google Sheet where Meta leads, website form submissions, or manual leads are collected
2. Share that sheet with the NEXORA service account email (Viewer access only)
3. In NEXORA → Settings → Integrations → Add Connection:
   - Paste the Sheet URL or Sheet ID
   - Select the tab name (e.g. Sheet1)
   - Click **Test Connection** — NEXORA reads the headers and shows 3 sample rows
   - Map columns: which column is "Name", which is "Phone", which is "Event Type", etc.
   - Save
4. Click **Sync Now** — NEXORA imports all rows as leads, tagged with the correct source
5. Duplicate phone numbers and emails are automatically skipped

**Multiple sheets per property:**
- One connection for Meta leads
- One for website form leads
- One for Google Ads leads
- One for manual/ops sheet

Every imported lead triggers the WhatsApp automation sequence automatically.

---

## 5. WhatsApp Automation

Path: `/whatsapp`

### Templates Tab
All pre-approved message templates stored in one place. Each template shows the content and variable placeholders. Templates are approved through your Wati WhatsApp Business account.

### Automation Flows Tab
Three automated sequences run without any manual work:

**Sequence 1 — New Lead Nurture (triggered on every new lead):**
| Timing | Message |
|---|---|
| Day 1 (5 min after inquiry) | Hotel brochure + intro + availability form |
| Day 3 | Venue video + seasonal offer |
| Day 5 | Testimonials / social proof |
| Day 7 | Urgency close — limited dates, early-bird offer |

**Sequence 2 — Post-Event Re-engagement (triggered when lead is marked Booked):**
| Timing | Message |
|---|---|
| 3 days after event | Thank you + rating request |
| 30 days after event | Referral ask |
| 90 days after event | "Planning your next event?" offer |

**Sequence 3 — Stage → LOST:**
All pending automated messages are cancelled immediately.

### Scheduled Queue
Shows every pending WhatsApp message: which lead, which template, when it will send. Messages are processed automatically every minute by the system.

### Broadcasts Tab
Send a bulk WhatsApp to a filtered segment of your lead database:
- Filter by stage (e.g. only leads in Follow-Up or Proposal Sent)
- Filter by event type (e.g. only Wedding leads)
- Live recipient count updates as you apply filters
- Schedule or send immediately
- Tracks delivered count

---

## 6. Campaigns

Path: `/campaigns`

Six campaign types matching the India banquet market:

| Campaign | Monthly Budget | Target |
|---|---|---|
| Social Events (Weddings, Roka) | ₹80,000 | HNI, newly engaged couples, 30km radius |
| Corporate Events | ₹70,000 | CEO/Director/HR, 200+ employee companies |
| Birthday & Social | ₹20,000 | Family decision-makers |
| Promotional Events | ₹15,000 | Arts and media professionals |
| Entertainment Events | ₹10,000 | Music and live events audience |
| Seasonal & Thematic | ₹5,000 | Frequent travellers |

**Campaign detail page shows:**
- Actual spend vs benchmark budget (progress bar)
- Actual CPL (cost per lead) vs benchmark CPL range
- Leads generated, bookings, conversion rate
- Color coded: green = within benchmark, red = over-spending per lead

**Create a campaign** at `/campaigns/new` — select the type and the budget, audience targeting hints, and CPL benchmarks auto-fill.

---

## 7. Platform Listing Management

Path: `/platforms`

Six platforms tracked and managed:

| Platform | Type |
|---|---|
| WedMeGood | Premium wedding platform |
| Weddingz.in | OYO-backed, destination weddings |
| VenueLook | 50+ cities, all event types |
| WeddingBazaar | Pan-India, verified listing |
| Google Business | Local SEO, Maps visibility |
| JustDial | B2B and local, high call volume |

Each platform card shows:
- Listing status (Active / Inactive / Needs Update)
- Content completeness score (0–100%)
- Last updated date
- Leads generated from that platform

**Platform detail page** has a content checklist — tick off what's done (photos uploaded, description complete, pricing added, reviews responded, etc.). Each item adds to the content score. A complete listing = more visibility = more inbound leads.

---

## 8. Proposals

Path: `/proposals`

### Create a Proposal
From a lead's detail page → Create Proposal. The form auto-fills:
- Title (e.g. "Wedding Proposal — Sharma Family")
- Content template based on event type
- Event date pulled from the lead

**AI generation:** Click "Generate with AI" — NEXORA writes a full, personalized proposal based on the lead's event type, guest count, budget, and notes. You can edit it before saving.

### Proposal Status Tracking
Each proposal moves through: `Draft → Sent → Viewed → Accepted / Declined`

**Send options:**
- Send via Email (goes to lead's email with the proposal content)
- Send via WhatsApp (sends a summary message with a link)
- Download PDF (print-ready format via browser print)

### Proposals List
Filter by status. See all proposals across all leads in one place. Overdue proposals (sent but no response in 5+ days) flagged on the dashboard.

---

## 9. Analytics

Path: `/analytics`

Four sections:

**Funnel** — Drop-off at every stage. Tells you exactly where leads are getting stuck (e.g. 60 leads reach Proposal Sent but only 15 become Booked = 75% drop-off at negotiation stage).

**Sources** — Pie chart of where leads come from. Which platform or campaign is sending the most volume.

**Campaigns** — Every campaign with actual CPL vs benchmark. If you're paying ₹600/lead on a campaign where the benchmark is ₹150–450, it shows in red.

**Revenue Trend** — 30-day rolling chart of leads, proposals, and bookings. Useful for spotting seasonal patterns.

---

## 10. Settings

Path: `/settings`

**Property tab:** Hotel name, location, contact details — shown on proposals and in WhatsApp messages.

**Users tab:** Add team members, assign roles (Owner / Manager / Executive), deactivate users.

**Integrations tab:** Google Sheets connections (covered in Section 4 above).

---

## The Complete Journey — From Ad Click to Booking

```
1. Meta / Google Ad runs
       ↓
2. Lead submits inquiry form → row added to Google Sheet
       ↓
3. NEXORA syncs the sheet → lead appears in dashboard (tagged by source + event type)
       ↓
4. WhatsApp auto-reply sent within 90 seconds (hotel brochure + availability form)
       ↓
5. 7-day drip sequence runs automatically (Day 3 video, Day 5 testimonial, Day 7 urgency)
       ↓
6. Sales manager opens lead detail → moves stage → adds note → assigns task
       ↓
7. Proposal created → AI generates content → sent via email + WhatsApp
       ↓
8. Lead accepts → stage moved to Booked → post-event re-engagement sequence scheduled
       ↓
9. Day 30: automated referral ask sent → new lead cycle begins
```

---

## What Makes NEXORA Different

| What hotels do today | What NEXORA does |
|---|---|
| Leads in personal WhatsApp, Excel, diaries | One unified inbox, all sources |
| First reply in 6–24 hours | Auto-reply in 90 seconds |
| One generic ad for all events | 6 targeted campaigns by event type |
| No idea which ad generated which booking | Full source-to-revenue attribution |
| Brochures sent manually on personal phone | Automated WhatsApp sequences |
| No platform presence (60%+ hotels not listed) | 6 platforms managed and scored |
| Revenue reporting = gut feeling | CPL, conversion, pipeline from real data |

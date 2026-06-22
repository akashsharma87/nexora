# NEXORA — Development Progress Log

Updated after each session. Records what was built, what data is hardcoded, and what remains.

---

## Session 1 — June 17, 2026
**Codex agent build**

### Built
- Complete Prisma schema (`prisma/schema.prisma`) covering all entities from the PRD domain model: Organization, Property, User, Lead, LeadActivity, Campaign, PlatformListing, MessageTemplate, AutomationFlow, BroadcastCampaign, Proposal, Task
- Docker PostgreSQL setup (port 5433) with `.env` and `.env.local`
- Auth: NextAuth v5 Credentials provider with bcryptjs hashing (`lib/auth.ts`)
- Prisma client singleton (`lib/db.ts`)
- Route access helper (`lib/access.ts`) — `requireSession()`, `canManage()`
- All API routes:
  - `GET/POST /api/leads`, `GET/PATCH/DELETE /api/leads/[id]`
  - `PATCH /api/leads/[id]/stage` — writes `STAGE_CHANGE` activity
  - `GET/POST /api/leads/[id]/activities`
  - `GET/POST /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/[id]`
  - `GET/POST /api/platforms`, `GET/PATCH /api/platforms/[id]`
  - `GET/POST /api/whatsapp/templates`, `GET/PATCH /api/whatsapp/templates/[id]`
  - `GET /api/whatsapp/automation`, `GET/POST /api/whatsapp/broadcasts`
  - `GET/POST /api/proposals`, `GET/PATCH/DELETE /api/proposals/[id]`
  - `GET /api/analytics/dashboard`, `GET /api/analytics/funnel`, `GET /api/analytics/sources`
  - `GET/PATCH /api/settings/property`, `GET/POST/PATCH /api/settings/users`
- All frontend pages wired to real API data:
  - `/` Dashboard — KPI cards, stage distribution, recent leads from DB
  - `/leads` — list with search, stage filter, event type filter
  - `/leads/new` — create lead form → POST → redirect to lead detail
  - `/leads/[id]` — lead detail with stage selector, activity timeline, proposals list
  - `/leads/[id]/proposal/new` — create proposal form
  - `/campaigns` — list with inline create form
  - `/campaigns/[id]` — campaign detail/edit
  - `/whatsapp` — templates, automation flows, broadcasts (tabs)
  - `/platforms` — six listing cards with status update
  - `/platforms/[id]` — platform detail/edit
  - `/analytics` — funnel chart, source pie, campaign table, revenue bar chart
  - `/proposals` — all proposals with status filter
  - `/proposals/[id]` — proposal detail with status timeline
  - `/settings` — property form + user management
  - `/login` — NextAuth credentials login
- Login form with demo credentials hint
- Sidebar with all navigation routes and logout
- Seed data: 1 org, 1 property, 3 users, 30 leads, 6 campaigns, 6 platform listings, 10 WhatsApp templates, 3 automation flows, 8 proposals

### Hardcoded / Stubbed Data in Session 1
- **`components/trend-chart.tsx`** — 30-day chart used entirely fake static data (fixed in Session 2)
- **`components/sidebar.tsx`** — User profile section showed hardcoded "Hotel Manager" / "manager@hotel.com" (fixed in Session 2)
- **`lib/format.ts`** — Currency was "Rs" not "₹" (fixed in Session 2)
- WhatsApp send actions are stubbed (`lib/whatsapp.ts`) — logs to console. Real API calls activate when `WHATSAPP_API_TOKEN` env var is set.
- Campaign "Download Report" and "Export CSV" buttons are UI-only, no action
- Analytics "Export" button — UI-only

---

## Session 2 — June 17, 2026
**Claude Code build — critical fixes + feature additions**

### Fixed
- **Route protection confirmed working** — Next.js 16 uses `proxy.ts` (not `middleware.ts`) for middleware. The existing `proxy.ts` correctly protects all routes. Routes redirect to `/login` when unauthenticated.
- **Currency symbol fixed** in `lib/format.ts` — "Rs" → "₹" across the entire application (Dashboard, Leads, Analytics, Proposals, Campaigns all now show ₹ correctly)
- **Sidebar now shows real session user** — name, email, and role initials pulled from `useSession()` hook
- **Campaign budget input was read-only** — `onChange={() => undefined}` pattern broke the field. Now controlled with state; auto-fills from campaign type but remains fully editable.
- **30-day trend chart now uses real DB data** — replaced hardcoded static array with `/api/analytics/trend` endpoint that queries actual leads, proposals, and bookings grouped by day

### Added
- **Lead source filter** on `/leads` page — dropdown for all 12 lead sources (WedMeGood, Meta, Google, Walk-In, etc.). API already supported this, UI was missing it.
- **Lead edit form** on `/leads/[id]` — "Edit" button reveals an inline form to update name, phone, email, event date, guest count, budget, and notes. Calls `PATCH /api/leads/[id]` and refreshes the timeline.
- **`/api/analytics/trend` route** — new endpoint returning daily leads/proposals/bookings for the last 30 days, grouped by date with readable labels.

### Remaining Hardcoded / Stubbed Data
- WhatsApp send action is stubbed in `lib/whatsapp.ts` — activates when `WHATSAPP_API_TOKEN` env var is set
- Campaign "Export", "Download Report" buttons — UI-only, no action
- Analytics "Export" button — UI-only
- Platform "Sync Now" / "View Leads" links — UI-only
- Proposal "Send via WhatsApp" button — stubs to WhatsApp lib (which is itself stubbed)

---

## Session 3 — June 18, 2026
**Phase 1 completion + Phase 2 start**

### Built

**Phase 1 — Core Lead OS (completing remaining items):**

- **Tasks on lead detail** — Add task form (title, due date, priority), task list with priority color badges (LOW/MEDIUM/HIGH/URGENT), checkbox to mark complete. Each create/complete action logs an activity in the timeline. API: `GET/POST /api/leads/[id]/tasks`, `PATCH /api/tasks/[id]`
- **Lead assignment to team member** — "Assign To" select in the edit form fetches real users from `GET /api/users`. Saves `assignedToId` on the lead. Assigned user shown on detail page.
- **SLA stale lead badge** — Leads in `NEW` stage older than 24 hours show `⚠ Xh old` amber warning badge on the leads list cards.
- **CSV import for historical leads** — `/leads/import` page with file upload or paste textarea, client-side CSV parser, format reference table (eventType/source valid values), calls `POST /api/leads/import`, shows row-level error list. Import button on leads list header.

**Phase 2 — Communication start:**

- **WhatsApp send from lead detail** — "Send via WhatsApp" collapsible panel in the activity timeline area. Pre-fills a template message with lead name. Calls `POST /api/leads/[id]/whatsapp` which invokes `sendWhatsAppMessage` (stubbed, real API activates when provider env vars are set) and logs `WHATSAPP_SENT` activity.
- **Proposal pre-fill by event type** — Create Proposal page now fetches the lead on load. Auto-fills title (`EventType Proposal — Lead Name`), content (event-type-specific template text for Social/Corporate/Birthday/other), and event date from the lead record.
- **`GET /api/users`** — New endpoint returning all active users in the organization for assignment dropdowns.

### Hardcoded / Stubbed in this session
- WhatsApp send remains stubbed in `lib/whatsapp.ts` — activates when `WHATSAPP_API_TOKEN` env var is set

---

## Session 4 — June 18, 2026
**Phase 2 + Phase 3 features**

### Built

**Phase 2 — Communication, Proposal, and Follow-Up:**

- **Dashboard "Needs Attention" overdue leads widget** — Fetches from new `GET /api/analytics/overdue`. Shows 3 urgency groups:
  - NEW leads with no first contact >24h (amber)
  - CONTACTED/FOLLOW_UP leads with no activity >72h (orange)
  - PROPOSAL_SENT leads with no update >5 days (red)
  - Each row links to the lead detail page. Widget only renders when overdue leads exist. Refreshes every 60 seconds.
- **Proposal "Send via WhatsApp" button wired** — Button on proposal detail now calls `POST /api/leads/[id]/whatsapp` with a summary message. On success, auto-updates proposal status to SENT (if still DRAFT). Activity logged.
- **Broadcast segment targeting** — Broadcast creation form upgraded: stage filter + event type filter + live recipient count widget calling `GET /api/leads/count`. Recipient count auto-fills on broadcast save.

**Phase 3 — Campaign and Platform Operations:**

- **Campaign CPL benchmarks** — New `lib/campaign-benchmarks.ts` constants file with PRD data (budget, CPL range, conversion target per campaign type). Campaign detail page now shows:
  - Budget card: shows benchmark monthly budget
  - Leads card: actual CPL calculated (spent ÷ leads), benchmark CPL range shown beneath
  - Bookings card: benchmark booking conversion % range
  - Spent card: visual spend vs budget progress bar

### New API routes
- `GET /api/analytics/overdue` — overdue leads by SLA rule per stage
- `GET /api/leads/count` — count leads matching stage/eventType filters (used by broadcast targeting)

### Hardcoded / Stubbed
- WhatsApp send remains stubbed — no change
- Campaign benchmarks are PRD constants (not pulled from DB) — intentional, these are fixed industry benchmarks

---

## What's Done vs PRD Phase 0.5 Requirements

| Requirement | Status |
| --- | --- |
| Working authentication (login + roles) | ✅ Done |
| Real lead CRUD (add, list, detail) | ✅ Done |
| Lead stage transitions + activity timeline | ✅ Done |
| Dashboard metrics from actual DB data | ✅ Done |
| Lead search + stage filter + event type filter | ✅ Done |
| Lead source filter | ✅ Added Session 2 |
| Lead edit form | ✅ Added Session 2 |
| WhatsApp template preview | ✅ Done (list + content shown) |
| Campaign listing from real data | ✅ Done |
| Platform listing from real data | ✅ Done |
| Route protection (middleware) | ✅ Fixed Session 2 |

---

## Demo Script Status (PRD Section 0.5)

1. Login as Hotel Manager → ✅ works
2. Show Dashboard with live metrics → ✅ works
3. Add a new lead manually → ✅ works, redirects to detail
4. Lead appears in list with correct stage → ✅ works
5. Open lead detail → move stage → ✅ stage dropdown + note field
6. Activity timeline updates → ✅ stage change + note logged
7. Campaign listing (well-populated, seeded) → ✅ 6 campaigns from seed
8. Platform listing → ✅ 6 platforms from seed
9. WhatsApp template preview → ✅ 10 templates from seed

---

## Next Up (remaining before June 22 deadline)

**New top priority: Lead Integration Hub / Google Sheets ingestion**
- Build `/settings/integrations` so each organization/property can add multiple Google Sheet sources.
- Store sheet ID, tab name, source type, and column mapping in the database, not `.env`.
- Support separate sheets for website leads, Meta leads, Google Ads leads, WhatsApp marketing leads, and operations/manual sheets.
- Add manual "Sync Now" first, then scheduled sync after Railway/worker setup.
- Add dedupe via external row ID/hash plus phone/email matching.
- Use a Google service account for MVP; clients share sheets with the service-account email.

**Phase 2 remaining:**
- WhatsApp Business API integration (provider: Interakt/Wati/360Dialog) — real send activation
- E-sign workflow for proposals (Phase 2 PRD requirement)
- 7-day drip automation execution engine (currently flows are display-only)

**Phase 3 remaining:**
- Platform content score management UI (update contentScore on platform listings)
- Source-to-campaign attribution (link leads back to a specific campaign)
- Analytics CPL chart by campaign type (using real spent/leads data)

**Polish / exports:**
- CSV export for lead list (Download button currently UI-only)
- Campaign Export Report (currently UI-only)
- Analytics Export (currently UI-only)
- Proposal PDF print styling (window.print() works, needs print CSS)

**Post-deadline:**
- Real Meta / Google Ads API integration (Phase 5, after Sheets ingestion proves the ingestion model)
- Platform API sync for WedMeGood, VenueLook etc
- Multi-property consolidated dashboard
- Railway production deployment

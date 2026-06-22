# NEXORA Product Requirements Document

## 1. Context

This PRD is based on two sources:

- `nexora_banquet_platform_20260510085026.pdf`
- The current frontend prototype in this repository

The PDF defines the business story and product vision. The codebase shows the current information architecture, visual language, and the first-pass module breakdown already implied by the UI.

---

## 2. Product Summary

NEXORA is a banquet revenue operating system for hotels, built by Internet Moguls (14 years experience, 200+ hotel clients). Its purpose is to help hotel banquet teams centralize leads, run structured demand-generation campaigns, automate follow-up, manage venue listings, send proposals faster, and measure revenue performance from source to booking.

At a product level, NEXORA is not just a CRM and not just a marketing dashboard. It is intended to sit across the full banquet revenue workflow:

1. Demand generation
2. Lead capture
3. Lead qualification
4. Instant response (90-second SLA via WhatsApp)
5. Nurture and follow-up
6. Proposal and booking conversion
7. Platform listing management
8. Attribution, reporting, and revenue optimization

### Market Context

- India wedding market: ₹130B+ annually
- Events per year across India: 10M+
- Leads still managed offline: 85% — the primary opportunity
- Hotels lose ₹15–50 Lakh/year in banquet revenue to faster, better-organized competitors

---

## 3. Problem Statement

Six critical hotel banquet pain points drive the product:

1. **Scattered lead sources (Critical):** Leads pour in from Meta, Google, WedMeGood, Weddingz, walk-ins, and referrals — all in separate places with no single view and no unified follow-up.
2. **Zero follow-up system (6–24 hrs):** 85% of hotel banquet teams use personal WhatsApp and offline diaries. Hot leads go cold in 48 hours. Response time averages 6–24 hrs.
3. **No campaign structure (Random):** Hotels run random ads with no campaign calendar. No segment-wise targeting — wedding, corporate, and birthday all receive the same creative.
4. **No platform visibility (60%+):** Over 60% of online venue searches return zero results because hotels are not listed on WedMeGood, VenueLook, or Weddingz.
5. **No ROI visibility (Unknown):** Hotel owners cannot identify which campaign generated which lead. Ad spend is guesswork with no tracking.
6. **WhatsApp used wrong (Manual):** Teams manually forward hotel brochures on personal WhatsApp with no automation, no broadcast, and no template messaging.

The quantified business consequence is ₹15–50 Lakh per hotel per year in lost banquet revenue to more organized competitors.

---

## 4. Product Vision

NEXORA should become the system of record and system of action for hotel banquet revenue teams.

The long-term vision:

- Every banquet lead enters one system.
- Every lead is auto-tagged by source, event type, priority, and lifecycle stage.
- Every inquiry gets a trackable response within 90 seconds.
- Every campaign has structure, budget, and measurable ROI.
- Every platform listing is managed centrally.
- Every proposal and follow-up is standardized.
- Every booking can be traced back to channel, campaign, and sales actions.

Setup promise: dashboard live + 6 campaigns running + 4+ platforms listed + WhatsApp automation active — within 14 days.

---

## 5. Target Users

### Primary users

- **Hotel owner / GM:** Needs revenue visibility, performance, ROI, and growth opportunities across all banquet operations.
- **Banquet sales manager:** Owns lead handling, qualification, proposals, and booking conversion. Primary daily user.
- **Banquet sales executive / coordinator:** Needs an operational workspace for daily lead follow-up and activity tracking.
- **Marketing manager or external marketing partner:** Needs campaign planning, platform visibility, and attribution reporting.

### Secondary users

- **Front office / inquiry desk:** Captures walk-in and phone leads.
- **Finance / leadership:** Needs revenue, pipeline, and spend accountability.
- **Nexora internal admin / support team:** Required for managed-service operations across multiple hotel accounts.

---

## 6. Product Goals

### Business goals

- Increase qualified banquet leads per property by 3–5× within 90 days.
- Reduce first-response time from 6–24 hours to under 90 seconds.
- Improve lead-to-booking conversion to 28–40%.
- Generate ₹20–50 Lakh additional annual banquet revenue per property.
- Create repeatable banquet demand generation across all six event categories.

### Product goals

- Create a unified banquet lead inbox with full source coverage.
- Support campaign planning and execution across six event segments with dedicated targeting.
- Provide WhatsApp-based automation for instant response, 7-day nurture, and broadcast.
- Centralize proposal, follow-up, and booking progression with e-sign support.
- Provide actionable dashboards focused on CPL, conversion, and revenue — not vanity metrics.

---

## 7. Non-Goals for Initial Versions

These should not be treated as day-one MVP requirements unless they become critical:

- Full hotel PMS replacement
- Full sales CRM for all hotel departments beyond banquet
- Complex accounting or invoicing workflows
- Deep event execution and banquet operations management
- Full creative studio or ad-asset production tooling
- Multi-country expansion requirements
- AI-generated campaign recommendations (Phase 4 and beyond)

---

## 8. Core Product Pillars

The PDF and frontend align around six major modules plus one cross-cutting orchestration layer:

1. Unified lead dashboard
2. Campaign management (six campaign types)
3. WhatsApp automation
4. Platform listing management
5. Analytics and reporting
6. Proposal and follow-up workflow
7. **Revenue flywheel orchestration** (cross-cutting — links all six modules into a single automated journey)

---

## 9. The Revenue Flywheel

The flywheel is the core product narrative from the PDF. It is a 6-step automated journey from ad click to signed booking.

| Step | Action | Detail |
| --- | --- | --- |
| 01 | Run 6 campaigns | Meta + Google per event type, structured by audience and budget |
| 02 | Lead captured | Auto-tagged by event type, source, and priority in one dashboard |
| 03 | 90-second reply | WhatsApp auto-sends hotel brochure, banquet photos, pricing deck, and availability form |
| 04 | 7-day nurture | Automated drip sequence: Day 1 intro → Day 3 video + offer → Day 5 testimonial → Day 7 urgency close |
| 05 | Proposal sent | Standardized template proposal with e-sign link |
| 06 | Booked and upsell | Post-event referral ask + next-event re-engagement |

**Expected results within 90 days:**
- 3–5× more qualified leads per month
- 90-second response time (vs 6–24 hr industry average, −95%)
- 28–40% lead-to-booking conversion (+150% vs previous period)
- ₹20–50 Lakh additional annual banquet revenue per property
- 6 campaign types running simultaneously (vs 1 previously)
- Zero manual creative or follow-up work (100% automated)

---

## 10. Current Frontend Audit

### Confirmed stack already present in the repo

- Next.js 16.2.6 with App Router
- React 19
- TypeScript 5.7.3
- Tailwind CSS v4.2.0
- Base UI / shadcn-style component setup (CVA + clsx + twMerge)
- Recharts 3.8.1 for charts
- Lucide React 1.16.0 for icons
- Vercel Analytics 1.6.1

### Routes currently present

- `/` Dashboard
- `/leads`
- `/campaigns`
- `/whatsapp`
- `/analytics`
- `/platforms`

### What the current frontend already does well

- Establishes the main module structure of the product.
- Shows the expected navigation model for a hotel manager.
- Provides a strong first visual direction for a revenue dashboard product.
- Encodes useful domain language: leads, proposals, bookings, pipeline, campaign types, WhatsApp templates, platform listings, ROI / CPL / conversion metrics.
- Gives a good baseline for cards, tables, charts, filters, and modal patterns.
- Achievement badge system and Smart Insights components are built and presentable.
- Lead scoring (0–100) component already exists.

### What the current frontend actually is

The current codebase is a UI prototype, not a working product.

Current limitations:

- All data is hardcoded in page components.
- No backend, database, auth, or API layer.
- No server actions, route handlers, or persistence flows.
- No real integrations for Meta, Google, venue platforms, or WhatsApp.
- Buttons do not trigger product workflows.
- No real lead detail page, timeline, or activity model.
- No actual campaign creation or proposal generation flow.
- No real platform sync or ingestion pipeline.
- Settings and Logout routes are referenced in the sidebar but not implemented.
- Lead status model (NEW / WARM / HOT) is simplified versus the full stage lifecycle needed.

### UX / implementation observations from the current code

- Design is dashboard-first and manager-friendly. Good baseline.
- Dark mode is forced in the root layout even though light and dark tokens both exist.
- Several strings show encoding issues for currency and emoji — clean this early.
- Shared components are present but domain data lives locally in each page.
- Current IA is useful but data model and workflows are still implied, not implemented.

---

## 11. Product Scope by Module

### 11.1 Unified Lead Dashboard

Lead stage lifecycle (canonical):

| Stage | Meaning |
| --- | --- |
| New | Inquiry received, not yet actioned |
| Contacted | First response sent (WhatsApp / call) |
| Follow-Up | Active follow-up in progress |
| Site Visit | Lead has visited or is scheduled to visit the venue |
| Proposal Sent | Formal proposal delivered |
| Negotiation | Terms being discussed |
| Booked | Booking confirmed with deposit or contract |
| Lost | Lead closed as lost with reason logged |

Required capabilities:

- Collect leads from all inbound channels into one pipeline.
- Tag leads by: source, event type, property, location, budget (in lakhs), guest count, event date, stage, and lead score (0–100).
- Support the full stage lifecycle above.
- Provide activity history for each lead (timeline of every touch).
- Allow assignment to sales exec, reminders, follow-up tasks, and SLA monitoring.
- Lead detail page with full contact info, event details, notes, and activity timeline.

### 11.2 Campaign Management

The six campaign types from the PDF with targeting parameters and CPL benchmarks:

| # | Campaign Type | Monthly Budget | Target Audience | CPL Range (Meta) | CPL Range (Google) | Booking Conversion |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Social Events (Weddings, Roka, Anniversary) | ₹80,000 | Age 24–56, 30 km radius, HNI, newly engaged | ₹150–450 | ₹200–600 | 28–40% |
| 02 | Corporate Events (Conferences, Board Meetings, Product Launches) | ₹70,000 | Age 22–65, 200+ employee companies, CEO/Director/HR | ₹300–700 | ₹300–700 | 40–65% |
| 03 | Birthday & Social (Birthdays, Anniversaries, Retirement) | ₹20,000 | Age 20–54, family decision-makers | ₹80–200 | ₹120–300 | 25–35% |
| 04 | Promotional Events (Fashion Shows, Art Exhibitions, Food Festivals) | ₹15,000 | Age 20–54, arts and media professionals | — | — | — |
| 05 | Entertainment Events (Live Music, Comedy, Dance) | ₹10,000 | Age 20–54, music and live events interests | ₹100–300 | ₹150–400 | 22–35% |
| 06 | Seasonal & Thematic (New Year, Diwali, Christmas, Monsoon Brunches) | ₹5,000 | Age 20–54, frequent travellers | ₹200–500 | ₹250–600 | 32–45% |
| | **Total monthly ad budget** | **₹2,00,000** | | | | |

Required capabilities:

- Maintain campaign calendar, budgets, and CPL benchmarks per type.
- Track actual spend, leads generated, CPL, CTR, and conversion by campaign.
- Associate each campaign with audience definition, geography, keywords, creatives, and channels.
- Support creative asset upload per campaign type (recommended specs: 1200×628px, 1080×1080px, Reels, Carousel, Single Image, Video 15–30 seconds).
- Support managed-service execution model or structured campaign tracking.
- Total monthly budget cap: ₹2,00,000 configurable per property.

### 11.3 WhatsApp Automation

Key performance benchmarks from the PDF: 98% open rate (vs 22% email), 3× higher response rate (vs SMS), 32% conversion lift.

Required capabilities and flows:

**Instant Lead Response:**
- Auto WhatsApp reply within 90 seconds of any inquiry.
- Message includes: hotel brochure, banquet photos, pricing deck, and availability form link.

**7-Day Drip Nurture Sequence:**
- Day 1: Introduction + brochure
- Day 3: Venue video + seasonal offer
- Day 5: Testimonial or social proof
- Day 7: Urgency close (limited dates / early-bird offer)

**Post-Event Re-engagement:**
- Day 3 after event: Thank you + rating request
- Day 30: Referral ask
- Day 90: "Next event?" offer

**Broadcast Campaigns:**
- Seasonal bulk WhatsApp to entire segmented lead database (Diwali, New Year, Wedding Season, Valentine's Day, Monsoon Brunches).
- Schedule in advance, track opens and responses.

**Other required capabilities:**
- Template management (create, edit, preview, approve).
- Conversation and template history per lead.
- WhatsApp automation flow builder (trigger → steps → conditions).
- Business API provider integration (not personal WhatsApp).

### 11.4 Platform Listing Management

Six platforms Nexora manages for clients:

| Platform | Tier | Audience | Key Features |
| --- | --- | --- | --- |
| WedMeGood | Premium | 10,000+ venues, wedding audience, high intent | Profile creation, photo upload, review management |
| Weddingz.in | Popular | OYO-backed, 1,000+ venues, vendor marketplace | Destination weddings, vendor marketplace, inquiry routing |
| VenueLook | Popular | 50+ cities, all event types, free quote system | Free quotes, high volume, all cities |
| WeddingBazaar | Verified | Pan-India reach, dedicated account management | Verified listing, review management, pan-India reach |
| Google Business | Essential | Search & Maps, local SEO | Local SEO, review responses, photo updates |
| JustDial | B2B | B2B and local, high call volume | Corporate leads, high volume, verified listing |

Required capabilities:

- Track hotel presence and status across all six platforms.
- Store listing status, last updated time, content completeness score, and platform tier.
- Track leads generated from each platform.
- Manage platform-specific health metrics, content update tasks, and listing quality.
- Display sync status and flag stale listings.

### 11.5 Proposal and Follow-Up

Required capabilities:

- Generate reusable proposal templates customized per event type.
- Track proposal state: Sent → Viewed → Accepted / Declined.
- Maintain negotiation follow-up task sequences per lead.
- E-sign workflow integration (Phase 1: track status; Phase 2: full e-sign flow).
- Document and brochure asset storage per property.
- Proposal turnaround time tracked as an operational KPI.

### 11.6 Analytics and Reporting

Required dashboards:

- **Lead funnel:** Total → Contacted → Proposal Sent → Negotiation → Booked, with drop-off %
- **Source and campaign attribution:** Leads, CPL, bookings, and revenue by source and campaign
- **Conversion rates:** Lead-to-proposal, proposal-to-booking, overall
- **Revenue pipeline:** Confirmed + likely + possible, by event type and property
- **Response time and SLA:** % of leads responded within 90 seconds; overdue follow-ups
- **Platform performance:** Leads and revenue per platform listing
- **Operational health:** Proposal turnaround, follow-up completion rate, stage velocity

---

## 12. Personas and Key Jobs To Be Done

### Hotel owner / GM

- "Show me whether banquet demand is growing."
- "Show me which channels produce revenue, not just leads."
- "Show me which dates, event types, and properties are underperforming."

### Banquet sales manager

- "Give me one place to work all leads."
- "Make sure no inquiry goes cold past 90 seconds."
- "Help me prioritize hot opportunities and close faster."

### Marketing manager

- "Show me which campaigns and platforms are working."
- "Let me segment campaigns by event type instead of running one generic ad plan."
- "Prove ROI clearly with CPL and revenue attribution."

### Sales coordinator

- "Tell me who to contact next."
- "Give me WhatsApp templates so I am not writing messages from scratch."
- "Let me update lead status quickly from one workspace."

---

## 13. Pricing and Engagement Model

This is important context for product scoping decisions. Two tiers are defined:

### STARTER — ₹50,000/month retainer

- Lead Dashboard + 2 Platform Listings
- WhatsApp Auto-Response
- Monthly Report
- Up to 100 Leads/month
- 2 Campaigns Managed
- CRM + Proposals

### GROWTH — ₹1,00,000/month retainer

- All 6 Campaigns Managed
- 4+ Platform Listings
- WhatsApp Broadcast
- CRM + Proposals
- Up to 400 Leads/month
- Priority Support

**Important:** Meta Ads, Google Ads, and all third-party platform costs are billed separately and directly to the client's ad accounts. Retainer fees cover platform access and managed service only.

This tiered model directly informs the feature gating strategy for the product.

---

## 14. Competitive Positioning

Nexora competes across 10 capability dimensions that no single competitor matches:

| Capability | Ad Agency | CRM Tool | WedMeGood / Weddingz | NEXORA |
| --- | --- | --- | --- | --- |
| Unified Lead Dashboard | — | Partial | — | Yes |
| 6 Campaign Types Managed | Partial | — | — | Yes |
| Meta + Google Ads Execution | Yes | — | — | Yes |
| Audience Targeting per Event Type | Partial | — | — | Yes |
| Google Keyword Targeting | Partial | — | — | Yes |
| WhatsApp Broadcasting | — | — | — | Yes |
| Platform Listings (6+) | — | — | Partial | Yes |
| Analytics and CPL Tracking | Partial | Partial | — | Yes |
| Hotel-Specific CRM | — | Partial | — | Yes |
| Proposal Automation | — | Partial | — | Yes |

Nexora wins in all 10 categories. No single competitor covers the full banquet revenue workflow.

---

## 15. MVP Definition

The true MVP should prove the banquet revenue workflow in software before layering automation.

### MVP must include

- Multi-source lead intake into one system
- Lead list, detail view, full lifecycle stages, and activity log
- Lead assignment and follow-up tasks
- WhatsApp-ready template and messaging workflow
- Basic proposal workflow with status tracking
- Campaign tracking model for all six campaign types
- Basic platform listing records
- Core reporting for lead source, stage conversion, and response time
- Authentication and role-based access (at minimum: Owner / Manager / Executive)

### MVP can defer

- Deep ad-account execution automation
- Full bid and budget optimization
- Full e-sign contract management
- Advanced AI recommendations
- Complex multi-property enterprise controls
- Full call-center tooling

---

## 16. Phase-wise Development Plan

### Phase 0: Discovery, Domain Design, and Product Foundation

**Objective:** Turn the PDF vision and UI prototype into a production-ready product design and data model.

Deliverables:

- Final domain model
- User roles and permissions model
- Lead lifecycle definition (canonical stages confirmed in section 11.1)
- Campaign taxonomy and event-type ontology (six types confirmed)
- Property model for multi-hotel support
- Integration strategy for WhatsApp, ads, and venue platforms
- Production information architecture
- Tracking and analytics event plan

Exit criteria:

- Agreement on MVP scope.
- Agreement on the canonical data model.
- Agreement on initial stack and deployment approach.

---

### Phase 0.5: Monday Showcase (Target: June 22, 2026)

**Objective:** Demonstrate that NEXORA is a real, working product — not just a prototype — to stakeholders.

This is a scoped working demonstration, not a feature-complete MVP. Priority is "real data, real interactions."

**In scope for Monday:**

- Working authentication: login page with role-based access (Owner / Manager roles minimum)
- Real lead CRUD: add new lead, view lead list, open lead detail page with all fields
- Lead stage transitions: ability to move a lead through stages with stage change logged in activity timeline
- Dashboard metrics calculated from actual lead data (not hardcoded)
- Lead search, filter by status, and filter by event type — all functional
- One working WhatsApp template preview (static display is acceptable)
- Campaign listing page pulling from real data records
- Platform listing page pulling from real data records

**Out of scope for Monday:**

- Real WhatsApp API integration
- Real Meta or Google Ads integration
- Platform API sync
- Proposal generation or e-sign
- Advanced analytics

**Demo script for Monday:**
1. Login as Hotel Manager
2. Show Dashboard with live metrics from test leads
3. Add a new lead manually (walk-in inquiry)
4. Show it appear in the lead list with correct stage
5. Open lead detail → move stage from New → Contacted → Follow-Up
6. Show activity timeline updating
7. Show Campaign listing (well-populated, even if data is seeded)
8. Show Platform listing page
9. Show WhatsApp template preview

---

### Phase 1: Core Lead OS MVP

**Objective:** Make NEXORA useful as a working banquet lead system before advanced automation.

Scope:

- Authentication and RBAC
- Hotel, property, and user setup
- Lead ingestion forms and manual entry
- CSV import for historical leads
- Full source tagging and event-type tagging
- Lead list, lead detail page, stage transitions
- Lead assignment, reminders, notes, and activity timeline
- Basic dashboard metrics from real data

Exit criteria:

- Teams can operate daily banquet lead management inside NEXORA.
- No lead needs to be tracked outside the system for core operations.

---

### Phase 2: Communication, Proposal, and Follow-Up Automation

**Objective:** Reduce response time to 90 seconds and standardize conversion workflows.

Scope:

- WhatsApp Business API integration
- Message templates
- 90-second auto-reply rule on new lead
- 7-day drip nurture sequences (Day 1 / Day 3 / Day 5 / Day 7 flow)
- Post-event re-engagement (Day 3 / Day 30 / Day 90 flow)
- Follow-up tasks, reminders, and SLA alerts
- Broadcast campaign scheduling and sending
- Proposal templates per event type
- Proposal sent / opened / accepted tracking
- Basic document and brochure storage

Exit criteria:

- New leads receive WhatsApp auto-reply within 90 seconds.
- Proposal flow is trackable end to end.

---

### Phase 3: Campaign and Platform Operations

**Objective:** Connect demand generation with lead operations.

Scope:

- Campaign entity with all six campaign types
- Campaign calendar, budget tracking, and CPL recording
- Spend, CPL, and conversion tracking
- Source-to-campaign mapping for attribution
- Platform listing directory (all six platforms)
- Platform status, health tracking, and listing content management
- Listing-generated lead attribution

Exit criteria:

- Teams can compare channels, campaign types, and platforms from one system.
- Leadership can see spend versus pipeline outcomes.

---

### Phase 4: Revenue Intelligence and Optimization

**Objective:** Convert operational data into decision-making intelligence.

Scope:

- Full funnel analytics with drop-off analysis
- Property-level performance views
- Booking and revenue attribution to campaign and channel
- Response-time analytics and SLA compliance tracking
- Lead quality scoring model
- Opportunity alerts and AI-assisted recommendations
- Executive reporting and exports

Exit criteria:

- Owners and managers can make budget and sales decisions from NEXORA reporting.
- System highlights underperformance and growth opportunities automatically.

---

### Phase 5: Maturity, Scale, and Service Operations

**Objective:** Support multi-property scale and stronger automation.

Scope:

- Multi-property dashboards and consolidated reporting
- Approval workflows
- Advanced permissions and audit logs
- Deeper ad-platform integrations (Meta, Google)
- Workflow engine hardening
- Enterprise reporting
- Support tooling for Nexora-managed hotel accounts

Exit criteria:

- NEXORA supports a scalable operating model across multiple hotel clients and properties.

---

## 17. Suggested Domain Model

Core entities:

- Organization
- Property
- User
- Role
- Lead
- LeadContact
- LeadActivity (timeline event: stage change, note, WhatsApp sent, proposal sent, etc.)
- LeadSource
- EventType
- Campaign
- CampaignBudget
- CampaignPerformanceSnapshot
- PlatformListing
- MessageTemplate
- MessageConversation
- AutomationRule
- Task
- Proposal
- Booking
- RevenueAttribution
- DocumentAsset

---

## 18. Integrations We Will Need to Plan For

### Likely external integrations

- WhatsApp Business API provider
- Google Sheets lead ingestion for client-owned website, Meta, Google Ads, WhatsApp, and operations sheets
- Google Ads
- Meta lead forms / ads
- Google Business Profile
- Venue platforms: WedMeGood, Weddingz.in, VenueLook, WeddingBazaar, JustDial
- Own SMTP server (for system transactional emails — not a third-party email SaaS)

### Important note

Some platform integrations may not support direct deep API control. Phase 1 and Phase 2 may require semi-manual or ops-assisted workflows before full automation is viable.

### Google Sheets integration strategy

Google Sheets should be treated as the first real ingestion layer because most clients and agencies already route website, Meta, Google Ads, WhatsApp campaign, and manual leads into separate sheets.

This must be multi-tenant:

- Sheet IDs must not be stored in environment variables.
- Each organization/property can add multiple sheet connections.
- Each connection stores sheet ID, tab name, source type, and column mapping in the database.
- Leads imported from a sheet are scoped to the selected property.
- Each imported row stores an external source reference so repeated syncs do not create duplicates.
- MVP should use a Google service account. Clients share their sheet with the service-account email.
- Later versions can add Google OAuth for direct sheet selection.

---

## 19. Reporting and Success Metrics

### Operational metrics

- First response time (target: under 90 seconds for all new leads)
- Leads touched within SLA
- Follow-up completion rate
- Proposal turnaround time
- Proposal acceptance rate

### Funnel metrics

- Leads by source
- Leads by event type
- Leads by campaign
- Stage conversion rates (especially New → Contacted drop-off, and Proposal → Booked)
- Lead-to-booking conversion
- Lost lead reason analysis

### Commercial metrics

- Cost per lead (actual vs benchmark per campaign type — see section 11.2)
- Cost per booking
- Revenue pipeline (confirmed / likely / possible)
- Confirmed booking revenue
- Revenue by campaign
- Revenue by source
- Revenue by platform listing
- Total ROI across all channels

---

## 20. Tech Stack Direction

### 20.1 Confirmed current frontend stack

- Next.js 16.2.6
- React 19
- TypeScript 5.7.3
- App Router
- Tailwind CSS 4.2.0
- Recharts 3.8.1
- Lucide React 1.16.0
- Base UI / shadcn-style component setup

### 20.2 Recommended product stack direction

| Layer | Direction |
| --- | --- |
| Frontend app | Continue with Next.js + TypeScript |
| Backend app layer | Next.js server capabilities (Server Actions + Route Handlers) first; split workers only where required |
| Database | PostgreSQL |
| ORM / schema | Prisma or Drizzle (to be finalized) |
| Auth | Clerk or Auth.js (to be finalized) |
| Background jobs | Queue-based worker architecture |
| Cache / rate limiting / queue backing | Redis |
| File storage | S3-compatible object storage |
| Transactional email | Own SMTP server (no third-party email SaaS) |
| Analytics | Product analytics plus internal reporting tables |
| Error monitoring | Sentry or equivalent |
| Testing | Unit + integration + end-to-end coverage |
| Deployment | **Railway** (web app + worker + managed Postgres + managed Redis + managed object storage) |

### 20.3 Tech decisions to finalize before Phase 1 build

- Auth provider (Clerk vs Auth.js)
- ORM choice (Prisma vs Drizzle)
- Queue / workflow engine (BullMQ, Trigger.dev, or similar)
- WhatsApp Business API provider (Interakt, Wati, 360Dialog, or similar)
- Search strategy (Postgres full-text vs Meilisearch)
- BI / product analytics tooling
- Multi-tenant isolation approach (row-level vs schema-level)
- SMTP server configuration and sending domain setup

---

## 21. Risks and Constraints

### Product risks

- The PDF describes a broad promise that can easily expand beyond a realistic MVP. Phase discipline is critical.
- Some "platform management" expectations may require manual ops workflows, not pure software integration, especially for platforms without public APIs.
- Attribution can become misleading if lead source capture is not standardized from day one.

### Technical risks

- WhatsApp Business API approval and template approval timelines are external dependencies.
- Background automation requires reliable job processing and retry logic from the start.
- Messaging and campaign automations require strong auditability and delivery receipts.
- Multi-tenant hotel data isolation must be designed correctly early — retrofitting is expensive.

### Delivery risks

- If CRM, marketing automation, listing ops, analytics, and proposal tooling are all attempted simultaneously, delivery will stall.
- The Monday showcase (Phase 0.5) is the immediate forcing function for scope discipline.
- Phase ordering matters more than feature count. Do Phase 1 completely before Phase 2 begins.

---

## 22. Immediate Product Gaps Between Vision and Current Prototype

The current frontend gives us the right module structure but not the underlying product behavior.

Highest-priority gaps:

1. No persistent lead system — all data is hardcoded
2. No lead detail page or activity timeline
3. No authentication or tenancy model
4. No integrations of any kind
5. No workflow or automation engine
6. No reporting backend
7. No proposal system
8. No real platform listing model
9. Lead stage model is simplified (NEW / WARM / HOT only) — needs full lifecycle
10. Settings and logout routes not implemented

---

## 23. Open Questions for Next Brainstorm

1. Is NEXORA primarily a SaaS product, a managed-service operating platform, or a hybrid? (The pricing model suggests hybrid.)
2. Are we building for one hotel property first or multi-property groups from day one?
3. Which inbound channels must be first-class in MVP?
4. Is WhatsApp automation core to Phase 1 or Phase 2? (Recommendation: Phase 2, but the 90-second auto-reply is the most visible product promise — this should move fast.)
5. Direct campaign execution inside the product, or campaign performance tracking only for Phase 1?
6. How deep should proposal and contract workflows go in Phase 1?
7. Which parts of platform listing management are software features versus internal ops workflows?
8. Which auth provider and ORM optimize for fastest delivery while keeping the stack clean for Railway deployment?

---

## 24. Practical Summary

NEXORA is a banquet revenue operating system that addresses a real ₹130B+ market where 85% of leads are still handled offline and hotels lose ₹15–50 Lakh annually to better-organized competitors.

The current frontend is a well-designed prototype that establishes the right module structure and visual direction. It is not a working product.

The immediate priority is Phase 0.5 — a working demo for Monday June 22, 2026 — showing real auth, real lead CRUD, real stage transitions, and a dashboard driven by actual data.

The full product builds in five phases: Lead OS → Communication automation → Campaign and platform operations → Revenue intelligence → Scale and service. Each phase has clear exit criteria and should be completed before the next phase begins.

Key confirmed decisions:
- Deployment: **Railway**
- Transactional email: **Own SMTP server**
- Six campaign types with specific CPL benchmarks are canonical
- WhatsApp 90-second auto-reply is a core product promise and must be in Phase 2
- Lead stage lifecycle now includes: New → Contacted → Follow-Up → Site Visit → Proposal Sent → Negotiation → Booked / Lost

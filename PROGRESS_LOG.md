# NEXORA — Development Progress Log

Updated after each session.

---

## Sessions 1–4 — June 17–18, 2026 (Codex + Claude Code)

### Built
- Full Prisma schema: Org, Property, User, Lead, Campaign, Platform, Proposal, Task, MessageTemplate, AutomationFlow, BroadcastCampaign, ScheduledMessage, WebhookEvent, IntegrationConnection, LeadExternalSource
- Docker PostgreSQL (port 5433) + seed (30 leads, 6 campaigns, 6 platforms, 10 WA templates, 8 proposals)
- NextAuth v5 credentials auth + JWT + route protection via `proxy.ts`
- Full lead CRUD: create, list (search/filter by stage/source/eventType), detail, stage transitions, activity timeline, edit, SLA badge, CSV import, assignment, tasks
- Campaigns: list, detail, CPL benchmarks, `campaigns/new` page
- Platforms: list, detail
- WhatsApp: templates, automation display, broadcast targeting UI with recipient count
- Proposals: list, detail, create from lead, send via WhatsApp
- Analytics: funnel, sources, trend chart (real DB data), overdue widget, attribution endpoint
- Settings: property + user management
- Dashboard: KPIs, recent leads, stage distribution, overdue widget, trend chart, My Tasks widget
- All lib files: `whatsapp.ts` (Wati), `automation.ts`, `openai.ts`, `google-sheets.ts`, `email.ts`, `campaign-benchmarks.ts`
- Cron endpoint: `POST /api/cron/process-messages` (processes ScheduledMessages via Wati)
- Wati webhook handler: `POST /api/webhooks/wati` (incoming messages → LeadActivity, auto-advance NEW→CONTACTED)
- Google Sheets integration: full backend (test, sync, dedupe), `settings/integrations` page
- Lead CSV export endpoint
- AI proposal generation endpoint (`/api/proposals/generate`) — uses OpenAI with fallback
- Register flow (`/register` page + `/api/register`)
- Platform connect UI + auto-seed defaults on first login

### Deployed
- Railway: `https://nexora-production-752d.up.railway.app`
- Managed PostgreSQL on Railway
- All env vars in `railway.env` (committed, no secrets in git — see `.gitignore`)

---

## Session 5 — June 23, 2026

### Google Sheets integration — ✅ Working locally
- Fixed Turbopack nested-route issue: created top-level `app/api/integrations/test/route.ts` and `sync/route.ts` (stateless, accept params in body)
- Added `getAvailableTabs()` to `lib/google-sheets.ts`; test endpoint returns tab list on wrong tab name; UI shows dropdown
- Google service account vars in `.env.local` (highest priority); `.env` typo `GOOGLE_SERVICE_ACCOUNT_EMAI` fixed
- Read-only enforced at OAuth scope level (`spreadsheets.readonly`) in `lib/google-sheets.ts:9`
- Sheet "citadel meta" (Meta leads) connected and mapped — 13 columns

### Wati WhatsApp — ✅ API wired, blocked on credits
- Root cause found: wrong API URL (`https://live-102339.wati.io` is the web UI; correct URL is `https://live-mt-server.wati.io/102339`)
- Old token format `wati_UUID.JWT` replaced with proper JWT from Wati dashboard (Settings → API)
- `.env` now: `WATI_API_URL="https://live-mt-server.wati.io/102339"`, `WATI_API_KEY="eyJhbGci..."`
- Template `nexora_initial_response` confirmed to exist in Wati; phone validation passes
- Only remaining blocker: **Wati account needs credits top-up** (error: "Not enough credits to send the message")
- Fixed URL casing: `addcontact` → `addContact`, `sendsessionmessage` → `sendSessionMessage`
- Template names now configurable via env vars (`WATI_TEMPLATE_INITIAL_RESPONSE`, etc.)
- Error messages from Wati now surface directly in the UI toast

---

## Production gaps (Railway) — not yet fixed
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` missing from Railway env
- `OPENAI_API_KEY` = placeholder — AI proposal generation non-functional
- SMTP not configured — email stubs active
- Railway Cron job not set up — endpoint `POST /api/cron/process-messages` exists, needs Cron service

## What's Stubbed / Not Yet Wired
- SMTP: `lib/email.ts` ready, needs SMTP env vars
- OpenAI: `lib/openai.ts` ready with rule-based fallback, needs `OPENAI_API_KEY`
- Railway Cron: `* * * * *` → `POST /api/cron/process-messages` with `x-cron-secret` header
- Platform content score checklist — `contentChecklist` schema field not yet added
- Source-to-campaign attribution on lead create form — endpoint exists, UI dropdown not wired

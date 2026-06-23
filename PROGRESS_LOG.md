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

### Current railway.env gaps (production broken until fixed)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — missing from Railway, Sheets integration will fail with "service account not configured" error
- `OPENAI_API_KEY` = placeholder `"your-openai-key-here"` — AI proposal generation non-functional in production
- SMTP not configured — email notifications won't send

### Google Sheets key structure: ✅ Correct
- Service account: `nexora@hotel-dashboard-478510.iam.gserviceaccount.com` (project: `hotel-dashboard-478510`)
- `.env` stores key with literal `\n` sequences; `lib/google-sheets.ts:4` does `.replace(/\\n/g, '\n')` — correct pattern
- Credentials need to be set in Railway dashboard (Variables tab handles multi-line without escaping issues)

### Next actions
- Add Google service account vars to Railway (see above)
- Test Sheets integration end-to-end: Settings → Integrations → Add connection → Test → Sync
- Client instruction: share their Google Sheet with `nexora@hotel-dashboard-478510.iam.gserviceaccount.com` (Viewer)

---

## What's Stubbed / Not Yet Wired
- SMTP email — `lib/email.ts` ready, stubs until SMTP env vars set
- OpenAI proposal generation — `lib/openai.ts` ready with rule-based fallback, needs real `OPENAI_API_KEY`
- Wati templates need Meta approval before template messages work (session message fallback active)
- Railway Cron job — endpoint exists, needs Railway Cron service configured (`* * * * *` → `POST /api/cron/process-messages` with `x-cron-secret` header)
- Platform content score checklist — schema field `contentChecklist` not yet added to Prisma
- Source-to-campaign attribution on lead create form — endpoint exists, UI dropdown not wired

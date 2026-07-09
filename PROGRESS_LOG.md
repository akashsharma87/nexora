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

## Session 6 — June 26, 2026

### AI Voice Calling — built & partially working

**Infrastructure built:**
- `calling-server/` — standalone Node.js WebSocket server (Twilio Media Streams ↔ OpenAI Realtime API)
- `lib/ai-calling.ts` — `scheduleAiCall`, `initiateAiCall`, `cancelAiCall`
- `app/api/ai-calls/route.ts` — GET (list + stats), POST (immediate or scheduled)
- `app/api/ai-calls/[id]/route.ts` — PATCH (outcome from calling-server)
- `app/api/webhooks/twilio/route.ts` — call status callbacks → DB updates, retry logic
- `app/api/webhooks/twilio-twiml/route.ts` — returns TwiML `<Connect><Stream>` pointing to calling-server
- `app/api/cron/process-calls/route.ts` — cron picks up PENDING calls and dials
- `app/ai-calls/page.tsx` — AI Calls dashboard page
- Prisma schema: `AiCall` model + `AiCallStatus` / `CallOutcome` enums added
- "Call with AI" button added to lead detail page (`app/leads/[id]/page.tsx`)
- AI persona: "Priya", Hinglish, qualification flow, `report_outcome` tool

**Twilio setup:**
- Trial account, $15.50 credit
- Number purchased: `+1 754 256 4155` (US)
- Verified caller ID: `+91 88261 92288` (only this number can be called on trial)
- Env vars in Railway nexora service: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

**Railway deployment — new project:**
- Old project (`nexora-production-752d`) abandoned — Postgres credentials mismatch
- New project (`sparkling-courtesy`): `nexora-production-f468.up.railway.app`
- New Postgres service created fresh (old one had wrong password copied from old project)
- `helpful-insight` service = calling-server, URL: `helpful-insight-production-542a.up.railway.app`
- `CALLING_SERVER_URL`, `CALLING_SERVER_SECRET`, `APP_URL` added to nexora Railway vars

**Railway issues encountered:**
- GitHub "Repo not found" — Railway GitHub App didn't have access to `akashsharma87/nexora`
- Branch was `master`, Railway defaults to `main` → renamed to `main` (fixed nexora auto-deploy)
- `helpful-insight` still can't auto-deploy from GitHub (GitHub App access issue persists for that service)
- `helpful-insight` must be deployed manually: `railway up` from **root** Nexora directory (not from `calling-server/` — Root Directory is `/calling-server` in Railway settings so upload must include parent)
- CLI deploy command: `railway link --service helpful-insight` then `railway up` from repo root

**Bugs fixed this session:**
- `APP_URL` missing → Twilio URL was `undefined/api/webhooks/...` (error 21205)
- `TWILIO_ACCOUNT_SID` missing → "username is required"
- `response.create` sent before `session.updated` confirmed → timing fix
- **Current bug (fix deployed, not yet confirmed):** `streamSid` is null when OpenAI sends first `response.audio.delta` → audio silently dropped → Priya generates speech but it never reaches the phone. Fix: buffer audio chunks until `start` event sets `streamSid`, then flush.

**Bugs found & fixed this session (extended debugging):**
- `APP_URL` missing → TwiML URL was `undefined/...` ✅ fixed
- `TWILIO_ACCOUNT_SID` missing → "username is required" ✅ fixed  
- `response.create` before `session.updated` → timing fix ✅
- `streamSid` race condition → audio buffered until `start` event ✅
- TwiML URL callback never reached → switched to inline `twiml` param in `calls.create()` (Twilio trial doesn't fetch the `url` callback for outbound calls) ✅
- `OpenAI-Beta: realtime=v1` header → OpenAI GA API rejects it with `beta_api_shape_disabled` → **removed header** ✅

**Diagnostic tools added (still in code, useful for next session):**
- `[ws-upgrade]`, `[ws-verify]`, `[call:xxx]` logs in `calling-server/server.js`
- `[twiml]`, `[ai-calling]`, `[ai-calls POST]`, `[twilio-webhook]` logs in nexora routes
- HTTP catchall logger in calling-server express app

**Root cause of silence — CONFIRMED:**
Twilio trial accounts do NOT execute user TwiML (`<Connect><Stream>` OR `<Say>`) for outbound calls. Trial message plays for ~13 seconds, then call ends. Proven by adding `<Say>` which was never heard and duration stayed at 13s.

**WebSocket stack is fully working:**
- `curl` WebSocket test to `wss://helpful-insight-production-542a.up.railway.app/stream` → 101 ✅
- helpful-insight logs show `✅ OpenAI Realtime connected` on curl test ✅
- OpenAI Realtime API connects correctly (after removing beta header) ✅

**BLOCKER: Must upgrade Twilio from trial to paid account.**
- Add payment method at console.twilio.com → upgrade plan
- After upgrade: remove trial restriction, outbound TwiML will execute
- Code is ready — `lib/ai-calling.ts` has correct inline TwiML with `<Connect><Stream>`
- `<Say>` test line was reverted — clean state ready for paid account test

**Current code state (all committed to main):**
- `calling-server/server.js` — audio buffer fix + GA OpenAI API (no beta header) + full logging
- `lib/ai-calling.ts` — inline TwiML `<Response><Connect><Stream url="wss://helpful-insight..."/></Connect></Response>`
- `app/api/ai-calls/route.ts` — immediate call initiation with logging
- `app/api/webhooks/twilio/route.ts` — status callback logging
- `app/api/webhooks/twilio-twiml/route.ts` — GET+POST handlers (kept for reference, not used since inline TwiML)

**Deploy process (manual, both services):**
1. `railway link --project 86122726-ba0b-4044-a619-6eaaada2cb13 --service nexora && railway up --detach`
2. `railway link --project 86122726-ba0b-4044-a619-6eaaada2cb13 --service helpful-insight && railway up --detach`

---

## Session 7 — June 30 / July 1, 2026

### AI Voice Calling — paid Twilio account + call now reaches OpenAI (blocked on OpenAI credits)

**Twilio: upgraded trial → paid account.**
- New paid Twilio account created. New Account SID + Auth Token + a freshly purchased
  **US Local Voice number** (old trial number `+1 754 256 4155` did not carry over).
- Number provisioning: Twilio does NOT sell Indian local numbers — "No results found" when
  destination = India. Bought a **US number** (Voice only, Local type). The US number dials
  Indian mobiles fine; the lead just sees a `+1` caller ID. `formatPhoneE164()` already
  normalises lead numbers to `+91…` regardless of the Twilio number's country.
- Railway **nexora** vars updated with new `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_PHONE_NUMBER`. `APP_URL`, `CALLING_SERVER_URL`, `CALLING_SERVER_SECRET` unchanged.
- **No Twilio API key needed** — SDK auths with Account SID + Auth Token.
- **Voice Integrity registration was REJECTED** (requires US EIN/DUNS, US authorised-rep phone,
  US business address). **Irrelevant for our use case — ignore it.** It only affects US-carrier
  spam labelling; has zero effect on Indian networks. Closed and skipped.

**Bugs found & fixed this session:**
1. **Malformed TwiML XML → "an application error has occurred"** (the original trial-era symptom
   was actually masking this). The `<Stream>` URL packed params with raw `&` separators from
   `URLSearchParams`; inside an XML attribute `&` must be `&amp;`, so Twilio rejected the TwiML
   the instant a call connected and never opened the WebSocket. Was present in BOTH
   `lib/ai-calling.ts` (inline TwiML) and `app/api/webhooks/twilio-twiml/route.ts`.
2. **Deprecated OpenAI model** — `gpt-4o-realtime-preview-2024-12-17` no longer exists
   (`model_not_found`, close code 4004). Switched to GA model **`gpt-realtime`** in
   `calling-server/server.js`. Verified valid against the account via `/v1/models`.
3. **Lead params arriving null (`[call:null]`, lead name = "Sir/Madam")** — Twilio drops query
   strings on the `<Stream url>`. Switched to Twilio `<Parameter name=… value=…/>` child elements,
   read from `event.start.customParameters` in the calling-server `start` handler. Kept URL query
   as a harmless fallback. Without this, outcome write-back to the CRM would also have failed
   (needs `callId`).
4. **session.update timing** — now gated on BOTH the OpenAI socket being open AND Twilio's `start`
   event having delivered the lead params (so instructions include the real name). Helper
   `configureSession()` fires once both conditions are met. (Supersedes the older buffer-only fix;
   audio buffer kept as a safety net.)

**Confirmed working (verified by logs + curl this session):**
- TwiML XML now valid → Twilio executes `<Connect><Stream>` on answer.
- helpful-insight WebSocket: `curl` upgrade to `/stream` → **101 Switching Protocols** ✅
- Twilio → helpful-insight connection succeeds; `start` event + `streamSid` received ✅
- OpenAI Realtime WebSocket opens and accepts `gpt-realtime` model name ✅

**CURRENT BLOCKER: OpenAI account has no usable quota.**
- After fixing the model, the call now fails with `insufficient_quota` (HTTP 429) — confirmed
  **account-wide** (even a basic `gpt-4o-mini` chat completion returns 429), so it is NOT a
  Realtime/model problem.
- Root cause: adding a payment method ≠ having credits. OpenAI is prepaid — the **credit balance
  must be > $0** (platform.openai.com → Billing → "Add to credit balance"). The `sk-proj-…` key is
  project-scoped, so also confirm credits are on the SAME org/project the key belongs to and no
  $0 project budget cap.
- Still unverified (blocked by quota): whether `gpt-realtime` accepts the current **flat**
  `session.update` shape (`input_audio_format`/`output_audio_format`/`voice`/`modalities`/
  `turn_detection`) or needs the newer **nested GA shape** (`audio.input/output.format`,
  `output_modalities`). Probe script ready: `calling-server/test-realtime.js` tests both shapes —
  re-run once credits are live: `node test-realtime.js <OPENAI_API_KEY>` (needs `ws` installed).

**Deploy gotcha hit & resolved this session:**
- `railway up` MUST be run from the **repo root**, not from `calling-server/`. Running it from
  `calling-server/` deployed the calling-server's `server.js` to the **nexora** service (crash:
  `NEXORA_APP_URL is required`) and broke the helpful-insight build (`Failed to read app source
  directory` — Root Directory `/calling-server` looked for `calling-server/calling-server`).
  Re-ran both `railway up --detach` from `C:\Users\UIS\Desktop\Nexora` → both healthy again.

**Current code state (committed to main):**
- `calling-server/server.js` — model `gpt-realtime`; `<Parameter>`/customParameters reading;
  `configureSession()` gating; audio buffer safety net; full logging.
- `lib/ai-calling.ts` — inline TwiML with `<Stream url="wss://helpful-insight…/stream">` +
  `<Parameter>` children; XML-escaped values.
- `app/api/webhooks/twilio-twiml/route.ts` — same `<Parameter>` approach (kept in sync; not the
  primary path since calls use inline TwiML).
- `calling-server/test-realtime.js` — throwaway OpenAI Realtime session-shape probe (uncommitted).

**Next session — to finish AI calling:**
1. Confirm OpenAI credit balance > $0.
2. Re-run `calling-server/test-realtime.js` → confirm which `session.update` shape `gpt-realtime`
   accepts; if it needs the nested GA shape, update `configureSession()` in `server.js` and redeploy.
3. Make a real call from a lead detail page → expect to hear Priya; watch helpful-insight Deploy
   Logs for `🗣️ Priya said: …` and confirm outcome PATCH writes back to the `AiCall` row.

---

## Session 8 — July 1, 2026

### AI Voice Calling — GA session shape fixed + outcome write-back unblocked

**OpenAI credits recharged** → `insufficient_quota` gone. Immediately hit the shape issue
Session 7 flagged as unverified.

**Bug 1 — `Missing required parameter: 'session.type'` (no voice from Priya).**
- The `gpt-realtime` GA model rejects the old flat `session.update` (top-level
  `input_audio_format`/`output_audio_format`/`voice`/`modalities`/`turn_detection`).
- Proven with `calling-server/test-realtime.js`: flat ❌, GA nested ✅.
- Fix in `configureSession()` (`calling-server/server.js`): GA nested shape —
  `session.type: 'realtime'`, `output_modalities: ['audio']`, and
  `audio.input/output.format = { type: 'audio/pcmu' }` (g711 μ-law), with
  `audio.input.turn_detection` + `audio.input.transcription`, `audio.output.voice`.
- **GA also renamed server events** — probed a full turn to capture real names:
  - `response.audio.delta` → `response.output_audio.delta`
  - `response.audio.done` → `response.output_audio.done`
  - `response.audio_transcript.done` → `response.output_audio_transcript.done`
  Without this, audio would still silently drop even after the session configured. All three
  listeners updated.
- `report_outcome` handling hardened: handles BOTH `response.function_call_arguments.done`
  and `response.output_item.done` (function_call item), guarded so it reports at most once.

**Bug 2 — `Nexora API 405: Method Not Allowed` on outcome write-back.**
- Root cause (proven by curl): `proxy.ts` auth middleware intercepted
  `PATCH /api/ai-calls/[id]` BEFORE the handler, saw no session cookie, and 307-redirected to
  `/login`. Node `fetch` follows the redirect; `/login` rejects PATCH → 405.
- Fix: added `api/ai-calls` to the `proxy.ts` matcher exclusion list (same pattern as
  `api/webhooks`/`api/cron`). Safe — every method in `app/api/ai-calls/route.ts` and
  `[id]/route.ts` self-enforces auth (`requireSession()` for UI, `x-calling-server-secret`
  header for the calling-server).

**Deployed + verified live (both services, `railway up` from repo root):**
- nexora deploy live: `PATCH /api/ai-calls/nonexistent-id` now returns **404** (handler reached),
  was 307→405.
- helpful-insight deploy `74ba68d6` = SUCCESS; `/health` ✅.
- OpenAI GA session + events verified against the live API via the probe.

### Human-feel pass (after first successful call — Priya spoke but felt robotic)

**Bug 3 — Priya didn't stop when interrupted (no barge-in).** OpenAI streams audio faster than
real-time, so Twilio had seconds of her speech buffered; she finished her sentence over the
caller. Fix in `server.js`:
- On OpenAI `input_audio_buffer.speech_started`: send Twilio `{ event: 'clear', streamSid }` to
  flush its playback queue, drop the local `audioBuffer`, and `response.cancel` the in-progress
  response (guarded by a `responseActive` flag tracked via `response.created`/`response.done`).
- Added `interrupt_response: true` + lowered `silence_duration_ms` 700→500 in `turn_detection`.

**More human:**
- Voice `shimmer` → **`marin`** (most natural female voice for `gpt-realtime` GA; all of
  marin/cedar/coral/sage/shimmer/alloy probed as accepted).
- Rewrote `buildInstructions()` — short one-thought turns, natural Hinglish backchanneling
  ("hmm", "achha", "ji"), react-before-asking, no verbatim script, stop instantly on interrupt,
  no robotic "noted" confirmations.

**DEPLOY-DIR REMINDER (hit again):** running `railway up` with the Bash cwd inside
`calling-server/` fails with `Failed to read app source directory` (Root Directory `/calling-server`
→ looks for `calling-server/calling-server`). MUST `cd` to repo root first. Live build: `a1cff39f`.

### Human-feel pass 2 (feedback: barge-in worked, but she always resumed with "haan ji")

Applied OpenAI Realtime prompting best-practices (probed all params against live model first —
all accepted). Live build: `cb05c32a`.
- **Anti-repetition (the "haan ji" fix):** added a dedicated VARIETY section to
  `buildInstructions()` — never reuse the same acknowledgement/opener twice, rotate across a wide
  natural bank (achha / okay / theek hai / hmm / samajh gayi / bilkul / arre wah / sahi hai …),
  and on resume-after-interrupt react to what was actually said instead of defaulting to a filler.
- Restructured prompt into guide sections: Role, Personality & Tone, Variety, Pacing, Handling
  Interruptions, Unclear Audio, goals, wrap-up, boundaries. Short 1–2 sentence turns enforced.
- **`audio.input.noise_reduction: { type: 'near_field' }`** added — steadier VAD on handset audio
  (fewer false barge-ins). `output.speed` probed OK too; left at default 1.0.
- MVP stays on OpenAI voice (`marin`); ElevenLabs noted as a later upgrade for voice quality.

### Call closure / hang-up (feedback: after wrap-up she went silent instead of ending)

Priya delivered the wrap-up but nothing ended the call — server VAD just waited for the lead.
Added proper closure in `server.js`. Live build: `c6e481b5`.
- `report_outcome` is now framed as her FINAL action (say goodbye → then call it). On receipt it
  sets `pendingHangup`.
- Hang-up waits until the goodbye has actually PLAYED, not just been sent: once the goodbye
  response finishes (`response.done`), we send Twilio a `mark` (`nexora-hangup`) after the last
  audio chunk; Twilio echoes the mark back only after playback, and on that echo we `endCall()`
  (close both sockets). With `<Connect><Stream>` and no following TwiML, closing the stream hangs
  up the PSTN call. 8s safety timeout force-closes if the mark is never echoed.
- Instructions gained an "ENDING THE CALL" section: give a definite goodbye, do NOT ask anything
  or wait after it, then call report_outcome as the last action (works for interested / busy /
  not-interested / wrong-number endings).

**Next — final confirmation (needs a real call):**
- Place a call → expect varied acknowledgements (no repeated "haan ji"), warm `marin` voice,
  clean barge-in, AND a proper goodbye followed by the call hanging up on its own. Watch
  helpful-insight Deploy Logs for `👋 Goodbye done — mark placed`, `✅ Goodbye played — ending
  call`, and the outcome PATCH returning 200.

---

## Session 9 — July 1, 2026

### Multi-Project support — implemented per `MULTI_PROJECT_PLAN.md`

Users can now own/manage multiple projects (properties/banquets/hotels) under one account and
switch between them, with every existing feature (leads, campaigns, WhatsApp, analytics,
platforms, proposals, AI calls, settings) automatically scoped to whichever project is active.

**Why this was cheap:** the data model already supported it — `User` ↔ `Property` was already
many-to-many via `UserProperty`, and all 48 existing API routes already filtered by
`session.user.propertyId`. No Prisma migration needed; those 48 routes were not touched.

**The linchpin — `lib/access.ts` `requireSession()` rewritten:**
- Added `ACTIVE_PROPERTY_COOKIE` (`nexora_active_property`, httpOnly). `requireSession()` now
  resolves the active project from this cookie, but only after verifying `UserProperty`
  membership — a tampered/stale cookie can never leak another tenant's data. Falls back to the
  JWT's propertyId, then the user's first membership, if the cookie is absent/invalid.
- Overwrites `session.user.propertyId` with the resolved active id, so every existing route
  inherits the active project for free.
- `canManage()` extracted out to a new `lib/roles.ts` (zero server-only imports) and re-exported
  from `lib/access.ts` for backward compatibility — needed because `lib/access.ts` imports
  `next/headers` + prisma, which cannot be bundled into client components, but the new
  `ProjectSwitcher` UI needs `canManage()` to gate the "Add project" action.

**New API routes:**
- `GET/POST /api/projects` — list the user's projects (+ active id); create a new project
  (OWNER/MANAGER only), link the creator via `UserProperty`, **await** `seedPropertyDefaults`
  (so it isn't empty on first view), then set it as the active project.
- `POST /api/projects/switch` — switches the active-project cookie, but only after confirming
  the caller is actually a `UserProperty` member of the target (403 otherwise).

**Client:**
- `components/active-project-provider.tsx` — `ActiveProjectProvider`/`useActiveProject()` context
  (React Query, gated on `useSession().status === 'authenticated'` to skip the fetch on
  `/login`/`/register`), plus a shared `useCreateProject()` hook (single source of truth for the
  invalidate-everything + `router.refresh()` behavior on create). Wired into `app/providers.tsx`
  inside `QueryClientProvider`.
- `components/project-switcher.tsx` — dropdown in the sidebar header showing the active project,
  lists all projects with a checkmark, "+ Add project" (role-gated) opens a modal. The modal is
  rendered via `createPortal(..., document.body)` — it's nested inside the sidebar's own
  `position:fixed; z-index:50` container, and a `fixed` descendant does NOT escape an ancestor's
  stacking context for z-index purposes, so without the portal it could end up trapped behind
  future higher-z-index page content.
- `components/sidebar.tsx` — renders `<ProjectSwitcher />` beneath the NEXORA logo.
- `app/settings/page.tsx` — new "Projects" section (list + switch + add-project form, reusing
  the same hooks); Property section subtitle now shows which project is being edited.

**Verified:**
- `npm ci` + `npx prisma generate` (fresh checkout had no `node_modules`) — confirmed the Prisma
  composite key name `userId_propertyId` against the generated client (matches `@@id([userId,
  propertyId])` convention, used in `lib/access.ts` and `/api/projects/switch`).
- `npx tsc --noEmit` — zero errors in any new/changed file. The 8 errors reported are pre-existing
  (in `lib/auth.ts`, `lib/seeds/property-defaults.ts`, `prisma/seed.ts`,
  `app/api/seed/route.ts` — none touched this session) and already tolerated by
  `next.config`'s `typescript.ignoreBuildErrors: true`.
- `npm run build` — full production build succeeds; `/api/projects` and `/api/projects/switch`
  correctly registered as dynamic routes.
- Confirmed the AI-calling path (`lib/ai-calling.ts`) is unaffected — `propertyId` flows through
  explicit function params and the `AiCall` DB record, never re-derived from a session.

**Known limitation (intentionally not built, flagged in the plan):** no UI yet to grant an
*existing* teammate access to additional projects — a new user gets linked only to whichever
project was active when they were added in Settings. Future work if needed.

---

## Session 10 — July 2, 2026

### Meta Ads master-account OAuth — built, ready to test

Agency-managed connect flow: an Internet Moguls admin authenticates the master Meta Business
Manager once; every property then picks its ad account from the list that master token can see.
Google Ads follows the identical pattern next session (Meta built first, end-to-end, to validate
the flow before duplicating it).

**Schema (`prisma/schema.prisma`):**
- `AdPlatformConnection` — one row per organization per platform (`META` | `GOOGLE_ADS`), stores
  the long-lived access token, `tokenExpiresAt`, and the connecting Facebook user id
  (`@@unique([organizationId, platform])`).
- `Property` gained `metaAdAccountId` / `metaAdAccountName` + `googleAdsCustomerId` /
  `googleAdsAccountName` (the latter two unused until the Google Ads routes are built).

**Backend:**
- `lib/meta-ads.ts` — OAuth dialog URL builder, code → short-lived → long-lived (60-day) token
  exchange, paginated `/me/adaccounts` listing, `/me` profile lookup.
- `GET /api/integrations/meta/connect` — OWNER/MANAGER only; sets a short-lived httpOnly CSRF
  state cookie (`nexora_meta_oauth_state`), redirects to Facebook's OAuth dialog.
- `GET /api/integrations/meta/callback` — verifies state, exchanges the code, upserts the org's
  `AdPlatformConnection`, redirects back to `/settings/integrations` with a toast query param.
- `GET /api/integrations/meta/accounts` — returns connection status + a live ad account list from
  the stored token (no local caching table — always fetched fresh).
- `lib/validations/settings.ts` / `PATCH /api/settings/property` — now also accepts
  `metaAdAccountId`/`metaAdAccountName` (and the Google Ads equivalents) to link a picked account
  to the active property.

**UI:** `/settings/integrations` split into a Suspense-wrapped `page.tsx` +
`integrations-content.tsx` (required because the page now reads `useSearchParams()` for the
post-OAuth-redirect toast — Next.js will not statically build a client page using it without a
Suspense boundary, confirmed via `next build`). New "Ad Platform Connections" card above the
existing Lead Integrations section: Connect → search box → account list → click to link.

**Domain bug caught before deploy:** `META_ADS_REDIRECT_URI` and `GOOGLE_ADS_REDIRECT_URL` were
initially set to `nexora-production-752d.up.railway.app` — the Railway project abandoned back in
Session 6. Live service is `nexora-production-f468.up.railway.app` (confirmed via `railway status`
+ `railway variables`, cross-checked against `APP_URL`/`NEXTAUTH_URL` which were already correct).
Fixed in Railway vars and in the Meta app / Google Cloud OAuth client redirect settings before
testing — would otherwise have failed with a redirect_uri mismatch on first use.

**Verified before deploy:** `npx prisma validate` + `npx prisma generate` clean; `npx tsc --noEmit`
shows zero errors in any new/changed file (pre-existing unrelated errors in `lib/auth.ts`,
`lib/seeds/property-defaults.ts`, `prisma/seed.ts`, `app/api/seed/route.ts` untouched); `npx next
build` succeeds, `/settings/integrations` prerenders, new routes registered.

**Env vars added (Railway `nexora` service + local `.env`):** `META_APP_ID`, `META_APP_SECRET`,
`META_ADS_REDIRECT_URI`. `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET` still needed once the
Google Ads routes are built next session (developer token + MCC login-customer-id + redirect URL
already set).

**Deployed (same day, continued):**
- `npx prisma db push` run against production via the Railway Postgres public proxy
  (`railway run` couldn't reach `postgres.railway.internal` from outside Railway's network — used
  `DATABASE_PUBLIC_URL`'s host/port instead). **Note:** this put the production DB password in
  plaintext in a local shell command — recommended rotating it in Railway once confirmed healthy.
- GitHub → Railway auto-deploy did not pick up the `git push` (matches the flaky auto-deploy
  history from Session 6). Deployed directly via `railway up --service nexora --detach` from repo
  root instead — confirmed via `railway logs --build` that the new routes were actually in the
  built route list before declaring it done (auto-deploy silently not firing would otherwise have
  looked identical to a successful deploy).

**Bug found and fixed same day — OAuth callback redirected to a dead page.** After completing the
Facebook consent screen, users landed on `https://0.0.0.0:8080/settings/integrations?...` ("site
can't be reached") even though the connection itself had succeeded server-side. Root cause:
`app/api/integrations/meta/callback/route.ts` built the post-OAuth redirect with
`new URL('/settings/integrations', request.url)` — behind Railway's proxy, `request.url` resolves
to the container's bind address, not the public domain. Same class of bug already hit with Twilio
callback URLs (Session 6). Fix: build the redirect from `process.env.APP_URL` instead, matching
the convention `lib/ai-calling.ts` already uses. Deployed and confirmed live.

**Also caught mid-session:** the domain configured in the Meta app / Google Cloud OAuth client and
in Railway's `META_ADS_REDIRECT_URI`/`GOOGLE_ADS_REDIRECT_URL` was initially the abandoned
`nexora-production-752d` project (see the earlier note in this session) — corrected in all three
places before the first real connect attempt.

**Verified working end-to-end:** connected the Meta master Business Manager, listed handled ad
accounts, searched, and linked "Citadel Sarovar Portico Bangalore" to the `tamrind` test property.

### Meta campaign sync — built same day

The connect flow only stored *which* ad account to pull from; nothing populated the Campaigns
page (it was still showing `prisma/seed.ts`'s 6 hardcoded campaigns). Built the actual sync:

- `prisma/schema.prisma` — `Campaign` gained `externalId String?` +
  `@@unique([propertyId, externalId])`, so repeat syncs upsert instead of duplicating. Nullable is
  safe here — Postgres treats multiple `NULL`s in a unique index as distinct, so existing
  manually-created/seeded campaigns (`externalId = null`) don't collide.
- `lib/meta-ads.ts` — `listMetaCampaigns()` (campaign metadata + budget, paginated) and
  `getMetaCampaignInsights()` (lifetime spend + lead-like `actions`, `date_preset=maximum`).
  **Budget vs. spend unit mismatch documented in comments:** Meta's Campaign node reports
  `daily_budget`/`lifetime_budget` in the account currency's minor unit (÷100 needed); the
  Insights endpoint's `spend` field is already in major units (no ÷100) — an easy place to get a
  10,000% error wrong if not handled per-field.
- `app/api/integrations/meta/sync-campaigns/route.ts` (POST) — merges campaign metadata +
  insights, maps Meta's `effective_status` onto our narrower `CampaignStatus` enum, and upserts
  into `Campaign`. **Campaign `type` has no Meta equivalent** (our 6-type taxonomy is Nexora's own
  event-type ontology) — best-effort keyword match on the campaign name, reusing
  `normalizeEventType()` (newly exported from `lib/google-sheets.ts`, same heuristic already used
  for Sheet-imported leads) rather than inventing a second classifier.
- UI: "Sync Campaigns" button next to the selected account in `integrations-content.tsx`,
  invalidates the `['campaigns']` query on success so the Campaigns page reflects it immediately.

**Verified working end-to-end** on a real account with campaign history: connected Meta, linked
"Citadel Sarovar Portico Bangalore," clicked Sync Campaigns.

**Scope note surfaced by the user comparing our sync against Ads Manager directly:** the account
has 41 campaigns total, and the sync pulls all of them — including non-lead-gen boosted posts
(e.g. a cricket-night post boost, an Instagram profile-visit boost) that get a junk best-guess
`type` and 0 leads. Also, our numbers are lifetime totals (`date_preset=maximum`); Ads Manager's
default view is last-30-days, so side-by-side comparison will look wrong even when both are
correct. Neither fixed yet — flagged, not actioned.

### Lead-to-campaign attribution — wired (was silently half-built)

`app/leads/new/page.tsx` already had a campaign `<select>`, and `app/leads/[id]/page.tsx` already
rendered `lead.campaign` if present — but none of it worked, because:
- `Lead.campaignId` was a bare column with **no Prisma `@relation`** to `Campaign` — `include:
  { campaign: true }` would have silently been impossible.
- `leadCreateSchema` (Zod) never listed `campaignId`, so `POST /api/leads` silently stripped it
  from every submission regardless of what the form sent.
- Nothing anywhere incremented `Campaign.bookingsCount` — it would have stayed 0 forever even with
  the above two fixed.

Fixed all three: added `Lead.campaign`/`Campaign.leads` relation (no new column — `campaignId`
already existed, this is purely a Prisma-level mapping), added `campaignId` to
`leadCreateSchema`, added `campaign: { select: {...} }` to the lead detail GET include, and
increment `bookingsCount` on the `BOOKED` stage transition in
`app/api/leads/[id]/stage/route.ts` (no idempotency guard against double-transitioning into
`BOOKED` — matches the existing standard in that same function for its other side effects).

### Google Ads — connect + sync built, mirroring Meta exactly

`lib/google-ads.ts` + `app/api/integrations/google-ads/{connect,callback,accounts,sync-campaigns}`.
Same shape as Meta's pipeline, with two real differences:
- **Access tokens expire in ~1hr** (vs. Meta's 60-day token) — every accounts/sync call checks
  `tokenExpiresAt` first and refreshes via the stored `refresh_token` if near expiry, persisting
  the new token back to `AdPlatformConnection`. `access_type=offline` + `prompt=consent` on the
  auth URL are both required to actually get a `refresh_token` back on first consent.
- **No "lifetime" date literal in GAQL** (unlike Meta's `date_preset=maximum`) — used an explicit
  `WHERE segments.date BETWEEN '2000-01-01' AND '<today>'` as the lifetime-total workaround.
- Lead-count proxy is `metrics.all_conversions` (total conversions on the account), not filtered
  to lead-specific conversion actions — same class of approximation as Meta's `actions` substring
  match, documented in code.
- `Campaign.externalId` is now **platform-prefixed** (`meta:...` / `google_ads:...`) on both syncs
  — the unique constraint is only scoped by `propertyId`, so an unprefixed numeric-id collision
  between the two platforms could otherwise have silently merged two unrelated campaigns.
- `API_VERSION = 'v19'` in `lib/google-ads.ts` is a guess at current-for-2026 — Google Ads API
  versions sunset roughly yearly; verify it's still supported before relying on this long-term.

**Blocking — not yet click-tested:** `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET` are
**not set** in Railway (`GOOGLE_ADS_DEVELOPER_TOKEN`/`LOGIN_CUSTOMER_ID`/`REDIRECT_URL` all were).
The connect route will throw `GOOGLE_ADS_CLIENT_ID is not set` the moment someone clicks Connect
until these are added from the Google Cloud OAuth client's credentials page.

**Not done yet — next session:**
- Add `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET` to Railway, then real end-to-end test of
  the Google Ads connect → list → select → sync flow (built and deployed, unverified).
- Filter Meta/Google Ads sync to lead-gen-objective campaigns only, to stop non-lead boosted posts
  from polluting the Campaigns page.
- Rotate the production Postgres password (exposed during a manual `prisma db push` this session).

---

## Session 11 — July 8, 2026

### Google Sheets — sync every tab in a sheet + exact per-lead tab attribution

Context: the agency's team keeps one Google Sheet per platform (a Meta-leads sheet, a
Google-leads sheet), with a separate tab per campaign inside each (e.g. "Wedding", "Kitty
Party"). The existing integration only synced a single hardcoded tab per connection. Needed:
sync the whole sheet in one go, and record — with certainty, not a guess — which tab each lead
came from, since AI-calling/WhatsApp automation will branch on it next.

**Sync all tabs (`app/api/integrations/[id]/sync/route.ts`):** refactored the per-row import
logic into a shared `syncTab()` helper. `IntegrationConnection.tabName = null` is now the
sentinel for "sync every tab in this sheet" — the route calls the existing `getAvailableTabs()`
and loops all of them, importing each under the connection's single existing `source` (a sheet
is still one platform, per the team's actual setup — no per-tab source picker needed). Existing
single-tab connections are untouched, including keeping their original `externalId` format so
re-syncing doesn't duplicate already-imported leads (multi-tab mode namespaces the id with the
tab name instead, since one connection now spans several tabs).

**Exact tab attribution — went through two designs, second one is correct:**
- First pass stored `sourceTab` on `LeadExternalSource` and showed the *most recent* one on the
  lead detail page. Wrong: a later sync of a *different* tab that happens to phone-match an
  existing lead (dedupe-by-phone path) would silently overwrite which tab displayed, even though
  the lead's true origin never changed.
- Fixed: `sourceTab` now lives directly on `Lead` (nullable, new column), set exactly once —
  inside `syncTab()`'s lead-creation branch only, never on the phone-dedupe branch. It is
  immutable after creation, which is required since automation behavior will key off it later
  (e.g. a "Wedding"-tab lead vs. a "Kitty Party"-tab lead should get different call scripts/
  WhatsApp flows — not built yet, deferred to next session). `LeadExternalSource.sourceTab` is
  still recorded per sync event too, kept as an audit trail (e.g. to spot the same phone number
  showing up under two different campaign tabs).
- Lead detail page (`app/leads/[id]/page.tsx`) shows the tab as a small chip next to the stage
  badge. `GET /api/leads/[id]` needed no query changes — `sourceTab` comes back as a plain
  scalar column, no join.

**UI (`settings/integrations`):** added a "Sync every tab in this sheet" checkbox on the
connect form. When checked, the Tab Name field becomes a "preview tab" used only to detect
columns for the shared mapping (all tabs are assumed to share the same headers — true for this
setup since it's one sheet template copied per campaign). New tabs added to an already-connected
sheet later are picked up automatically on the next "Sync Now" — the tab list is re-fetched live
every sync, nothing is cached.

**Verified:** `npx tsc --noEmit` clean on all changed files (same pre-existing unrelated errors
as prior sessions, untouched); `npx prisma db push` applied `Lead.sourceTab` +
`LeadExternalSource.sourceTab` to the local dev DB; `npx next build` succeeds, all routes
registered.

**Deferred to next session (explicitly, by user request):** wiring `lead.sourceTab` into
`scheduleLeadNurtureSequence`/`scheduleAiCall` and the WhatsApp automation so different campaign
tabs actually trigger different call scripts / message flows. Needs a spec of what should differ
per tab before building — flagged, not actioned.

---

## Session 12 — July 8, 2026

### Google Sheets — all-tabs sync with zero manual column mapping (Phase 1 of `SHEET_SYNC_PHASE1_PLAN.md`)

Session 11 shipped "sync every tab in a sheet," but it inherited a flaw exposed the moment a
real sheet was tried: a single shared `columnMap` applied to every tab. The user's real setup —
one sheet per platform, one tab per campaign (e.g. "Wedding", "Kitty Party", "Presidential
Suite") — has a *different* column layout per tab (a fixed-price suite tab has no budget column
at all), and manually mapping 50 campaign tabs by hand was explicitly ruled out as unworkable.

**Grounded the fix in real data before writing code:** probed the actual connected sheet
("Citadel Bangalore - Leads," 16 tabs) using the live Railway service-account credentials (local
`.env`/`.env.local` keys and the on-disk service-account JSON were both stale — `invalid_grant` —
so `railway run` was used to inject the working key). Findings, all confirmed against real
headers/values:
- 15 real tabs + 1 junk empty tab (`Sheet18`), all 16 header layouts distinct — one shared
  mapping is structurally impossible.
- Name/Phone/Email exist on every tab, just spelled differently (`Ph Number` vs `phone no` vs
  `Phone Number`) — coverable by keyword aliases, no LLM needed for the fields that actually
  create a lead.
- Budget genuinely absent on 14 of 15 tabs (fixed-price rooms) — must be optional per tab, not
  required.
- Guest counts are buckets/ranges (`under_20`, `200+`, `3–4_guests`), not integers; event-date
  columns are often relative phrases (`this_month`, `Later`, `Aug`) — both would corrupt data if
  force-parsed.
- A Meta test-lead dummy row (`<test lead: dummy data for full_name>`) sits in one tab and must
  never be imported as real.

**`lib/google-sheets.ts`:**
- Range widened `Z` → `ZZ` on both header and full-row reads — a latent bug where any sheet with
  >26 columns would silently truncate data past column Z.
- `autoDetectColumnMap` gained aliases actually observed in the wild: `ph number`/`ph no`
  (headers using "Ph" don't contain the contiguous substring "phone" the other aliases rely on),
  and `no. of guest`/`how many guests`/`how many people`/`expected guest count`/`number of
  guest`/`no of people`/`group size` for the many ways sheets phrase guest count.
- New `isEmptyTab()` / `isPlaceholderRow()` guards.
- New `mapRowToLeadSmart(row, headers, columnMap, tabName)` — the core of Phase 1: event type
  comes from the **tab name** (the tab *is* the campaign), not a column; guest count and event
  date are only accepted when they parse as a clean integer / real date, otherwise the raw text
  is preserved in `notes` instead of being guessed wrong or dropped; every column the map didn't
  claim (follow-ups, remarks, street address, occasion questions) is folded into `notes`
  verbatim — nothing from the row is lost even when it can't be structured.

**`app/api/integrations/[id]/sync/route.ts`:** `syncTab()` takes a `smart` flag — legacy
single-tab connections keep using the manual `connection.columnMap` untouched; all-tabs
connections auto-detect per tab via `mapRowToLeadSmart`. Returns a per-tab summary (created/
skipped/failed/detected fields/warnings) alongside the run totals.

**`app/api/integrations/test/route.ts`:** new `allTabs` preview mode — given just a sheet URL,
returns every tab with its auto-detected fields, derived event type, and a missing-name/phone
flag. Powers a preview table instead of a mapping screen.

**`app/settings/integrations/integrations-content.tsx`:** connect flow rebuilt with a mode
toggle. All-tabs (new default): name → source → paste sheet URL → **Connect & Preview** → a
table of every tab with detected fields/event type/status → **Save**. No tab dropdown, no
mapping UI. Single-tab (legacy, manual mapping) kept fully intact behind the toggle for cases
that still need it.

**Verified before shipping — dry run against the real Citadel sheet** (`tmp/dry-run-sheet.ts`,
run via `railway run ... npx tsx`, not committed): **1,126 of 1,136 real rows would import
cleanly across all 15 tabs with zero manual mapping** — every tab resolved name+phone (including
the "Ph Number" abbreviation), `Sheet18` correctly skipped as empty, 6 Meta test-lead placeholder
rows correctly filtered, guest-count ranges and relative dates correctly preserved as text
instead of corrupted, non-numeric budget values (`below_₹5l`) preserved in notes instead of
silently dropped. `npx tsc --noEmit` and `npx next build` clean (same pre-existing unrelated
errors as prior sessions, in files untouched this session).

**No schema change this session** — `Lead.sourceTab`/`LeadExternalSource.sourceTab` from Session
11 already cover tab attribution; this session only changed how columns are mapped per tab.

**Deferred (Phase 2, per the plan doc, only if needed):** OpenAI-based structured extraction of
guest-count ranges / relative dates / occasion into real filterable fields, cached once per tab
by header-hash. Not built — the notes-preservation fallback already means no data is lost, just
not yet structured.

### Hotfix, same day — sync hit the wrong route and defaulted to a non-existent "Sheet1" tab

First real-world use immediately surfaced a bug Phase 1's dry run couldn't have caught: creating
an all-tabs connection worked, but clicking **Sync Now** failed with
`Unable to parse range: 'Sheet1'!A1:ZZ`.

**Root cause:** there were **two separate sync route files with duplicated logic** —
`app/api/integrations/sync/route.ts` (a top-level route from Session 5, added to dodge a
Turbopack nested-route bug; this is the one the settings UI actually calls) and
`app/api/integrations/[id]/sync/route.ts` (unreferenced anywhere in the codebase). Both sessions'
all-tabs work only ever touched the `[id]/sync` copy. The real UI button hit the untouched
top-level route, which still did `connection.tabName || 'Sheet1'` — since an all-tabs
connection's `tabName` is `null` by design, it silently defaulted to a tab named "Sheet1" that
doesn't exist in this sheet (real tabs are "Wedding," "Kitty Party," etc.), and Google's API
rejected the range.

**Fix:** extracted the entire sync implementation (tab looping, smart/legacy mapping branch,
per-tab summaries, status write-back) into one shared `lib/sheet-sync.ts` —
`syncIntegrationConnection(connection, userId)`. Both `app/api/integrations/sync/route.ts` and
`app/api/integrations/[id]/sync/route.ts` are now thin wrappers that just resolve the connection
and call it. This isn't just a bug fix — it removes the structural cause (two independently
maintained copies of the same logic) so the next change to sync behavior can't silently miss one
of them again.

**Verified:** confirmed via a direct prod DB query that the connection saved correctly with
`tabName: null` (the all-tabs sentinel worked) — the bug was purely in which route ran, not in
connection creation or the mapping logic already dry-run-verified earlier this session.
`tsc --noEmit` and `next build` clean. **Deliberately did not run a real sync against this
connection to test it** — it has ~1,126 real leads, and a live sync fires `scheduleAiCall` +
`scheduleLeadNurtureSequence` per new lead (real AI phone calls + WhatsApp messages to real
people). That first real sync is the user's call to trigger, not something to smoke-test with.

### Same day — WhatsApp nurture had no on/off toggle at all (the real bulk-blast risk)

After the sync hotfix, the user asked for the AI-calling toggle's "twin" for WhatsApp before
actually running a sync on the 1,126-lead Citadel sheet — correctly anticipating that the same
class of bug could exist on the messaging side. Checked before building anything (an Explore
agent read the schema, `lib/automation.ts`, and every call site):

- **AI calling already had this solved.** `Property.autoAiCallingEnabled` (`prisma/schema.prisma`,
  default `false`), a toggle on `/ai-calls` (`app/ai-calls/page.tsx`), and a gate inside
  `scheduleAiCall()` (`lib/automation.ts`) that returns early unless the property opted in.
  Confirmed via a direct prod query: **every property currently has it `false`** — so the sync
  hotfix alone was never going to trigger real calls.
- **WhatsApp nurture had nothing.** `scheduleLeadNurtureSequence()` unconditionally created 5
  `ScheduledMessage` rows per lead (`lib/automation.ts`) with no property check — every call site
  (manual lead create, CSV import, sheet sync) would have fired it for every single lead. This
  was the actual live risk on the Citadel sync: 1,126 leads → 1,126 real WhatsApp nurture
  sequences the instant Sync Now was clicked.

**Fix, mirroring the existing calling pattern exactly:**
- `Property.autoWhatsappNurtureEnabled Boolean @default(false)` (schema + `propertyUpdateSchema`).
- `scheduleLeadNurtureSequence()` now takes `propertyId` (added to all 3 call sites —
  `app/api/leads/route.ts`, `app/api/leads/import/route.ts`, `lib/sheet-sync.ts`) and returns
  early unless the flag is on — same shape as `scheduleAiCall`'s gate.
- Toggle added to `/whatsapp` (next to "Create Template"), same on/off pill style as the
  `/ai-calls` toggle, using this page's existing React Query conventions rather than copying the
  other page's raw-fetch style verbatim.

**Additional safety layer beyond the plain toggle (the "filter" the user asked for), applied to
both auto-triggers:** a shared `AUTOMATION_HOURLY_CAP = 20` in `lib/automation.ts` — even with a
toggle ON, no more than 20 leads per property per rolling hour get auto-enrolled into calling or
nurturing. Counted directly from real rows (`AiCall` count / `ScheduledMessage` count filtered to
`INITIAL_RESPONSE`), not an in-memory counter, so it holds across concurrent requests and process
restarts. This means turning a toggle on to catch up on day-to-day leads can never accidentally
mass-trigger everything if someone later bulk-imports a large historical sheet — leads beyond the
cap are still created normally in the CRM, just without auto-automation; the existing
purpose-built `/api/ai-calls/bulk-trigger` (capped at 50, staggered 90s apart) remains the correct
tool for deliberately catching up a backlog.

**Verified:** confirmed via direct prod DB query that all 6 properties have
`autoAiCallingEnabled: false` today. `npx tsc --noEmit` and `npx next build` clean (same
pre-existing unrelated errors, untouched files). `npx prisma db push` applied
`autoWhatsappNurtureEnabled` to both local dev and production Postgres.

### Same day — UI/UX pass on AI Calling, WhatsApp, Leads, and Dashboard

User feedback from actually using the deployed app, screenshots included. Seven distinct fixes:

1. **`/ai-calls` was missing the sidebar entirely.** Root cause: unlike every other page, it never
   wrapped its content in `<DashboardLayout>`. Fixed.
2. **"Start AI Calling" vs. the "Turn ON" toggle looked like duplicate controls.** They're not —
   one is an ongoing auto-trigger for future leads, the other a one-time manual catch-up batch
   for existing leads (filtered by age, capped at 50, staggered). Not a bug, just unclear UI.
   Restructured into two explicitly labeled sections: "Automatic — applies to every new lead
   going forward" and "Manual catch-up — call existing leads once, right now."
3. **WhatsApp nurture had a toggle but no equivalent manual/filtered catch-up.** AI calling
   already had `/api/ai-calls/bulk-trigger` for this; WhatsApp had nothing. Refactored
   `lib/automation.ts`: split `scheduleLeadNurtureSequence` (the gated auto-trigger) from a new
   exported `createNurtureSequence` (the unconditional row-creation logic, now takes an optional
   `baseTime` so calls can be staggered). New `app/api/whatsapp/bulk-nurture-trigger/route.ts`
   mirrors the calling one exactly — days-old filter, `scheduledMessages: { none: { templateType:
   'INITIAL_RESPONSE' } }` to skip already-nurtured leads, capped at 50, staggered 60s apart. Same
   two-section layout added to `/whatsapp`.
4. **Sheet-tab was only visible buried in the lead's activity note**, even though a chip was
   already added to the lead *detail* page in Session 11 — it just wasn't on the *list* page.
   Added `lead.sourceTab` to the leads list card as the same muted chip style.
5. **No way to filter leads by campaign/tab** — the exact scenario this whole sheet-sync feature
   was built for (50 campaigns → distinct tabs) had no corresponding filter. New
   `GET /api/leads/source-tabs` (distinct `sourceTab` values + counts for the property, via
   `groupBy`) powers a new "All Campaigns" dropdown on the Leads page, wired into
   `GET /api/leads`'s existing `where` clause via a new `sourceTab` query param.
6. **Dashboard had no breakdown by campaign** — "1024 leads" with no way to see how many came
   from which tab. New "Leads by Campaign" widget on the dashboard, same bar-list style as the
   existing "Lead Stage Distribution" widget, reusing the same `source-tabs` endpoint. Only
   renders when the property actually has sheet-tab-sourced leads.
7. **Two dead buttons on the Leads page** — the funnel (Filter) and grid-view icons had no
   `onClick` handler at all; they did nothing and no alternate view existed to switch to. Removed
   both rather than leave non-functional UI. Left the CSV export button alone (it already works).

**Verified:** `npx tsc --noEmit` and `npx next build` clean (same pre-existing unrelated errors,
untouched files); all new routes (`/api/leads/source-tabs`, `/api/whatsapp/bulk-nurture-trigger`)
registered in the build output. Confirmed via a local dev server that all four changed pages
compile without runtime errors. **Not verified with a live logged-in visual pass** — no test
credentials available in this environment; worth a quick manual check after deploy.

**No schema change** — `Lead.sourceTab` already existed from Session 11; this was all reads/UI.

### Same day — AI caller was using one static banquet script for every lead

User flagged that a lead from a "Presidential Suite" sheet tab and a lead from a "Kitty Party"
tab should not get the same conversation from Priya. Investigation confirmed this was worse than
just "generic wording":

- `buildInstructions()` (`calling-server/server.js`) only ever received `leadName`, `eventType`,
  `propertyName`, `eventDate` — `sourceTab` never reached the calling server at all.
- The opening line was **hardcoded** to the word "banquet" for every single call, and the whole
  "WHAT TO LEARN" section only asked about guest count / budget for hosting an event.
- A "Presidential Suite" lead isn't hosting a banquet — that sheet tab's own columns (Type Of
  Room, Check-In/Check-Out Date, Purpose Of Stay) show they want to book a **room for a personal
  stay**. Priya had no way to know this and would have asked them about "guest count for your
  event," which makes no sense to someone booking a room.

**Fix — two parts:**
1. **Wired `sourceTab` through the pipeline** — `lib/ai-calling.ts` now selects it from the lead
   and passes it as a Twilio `<Parameter>`; `calling-server/server.js`'s `start` handler reads it
   from `customParameters` alongside the existing fields.
2. **Split `buildInstructions()` into two flows**, chosen by a new `isRoomStayInquiry(tabName)`
   keyword check (suite/room/stay/accommodation) kept local to the calling script only — does
   NOT touch the CRM's `EventType` enum or any other feature, so this doesn't ripple into
   dashboards/filters:
   - **Banquet-event tabs** (Wedding, Kitty Party, Corporate, etc.): same flow as before, but the
     opening line now says the *actual* tab name ("...aapne humein **Kitty Party** ke liye
     enquiry bheji thi") instead of the hardcoded word "banquet" — works for any tab automatically,
     no per-tab hardcoding needed.
   - **Room-stay tabs**: different persona framing ("guest-relations executive," not "banquet
     coordinator") and different WHAT TO LEARN — check-in/check-out dates, number of guests
     staying, purpose of stay, room preference — instead of guest-count/budget-for-hosting.
3. **Did not add a new outcome field for check-out date** — traced `report_outcome`'s tool schema
   through `reportOutcomeToNexora()` → `PATCH /api/ai-calls/[id]` → `handleOutcomeUpdate()` in
   `app/api/ai-calls/[id]/route.ts` and confirmed that route's body type only reads `outcome,
   qualifiedScore, eventDate, guestCount, budgetRange, callbackTime, notes` — a new field would
   have been silently dropped (spoken by the AI, never stored). Instead reused existing fields
   for room-stay calls (`eventDate` = check-in date, `guestCount` = guests staying) which already
   flow end-to-end into `Lead.notes` and the activity log with zero backend changes, and told the
   model to fold check-out date + room preference into the existing free-text `notes` field.

**Verified:** `node --check calling-server/server.js` (separate Node service, not covered by
`next build`/`tsc`) plus a full manual read-through of the generated instruction text for both
branches. `npx tsc --noEmit` / `npx next build` clean on the `lib/ai-calling.ts` side. **Not
verified with a real test call** — this changes what a live AI voice call says to a real lead;
recommend a real Presidential Suite lead call and a real banquet-tab lead call before broad use.

**Deploy note:** this change spans BOTH Railway services — `nexora` (`lib/ai-calling.ts`) and
`helpful-insight` (`calling-server/server.js`) — both need `railway up` from repo root.

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

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

**Not done yet — next session:**
- `npx prisma db push` against the production DB (new `AdPlatformConnection` table + `Property`
  columns don't exist there until this runs — no Railway release command configured, must be run
  manually via `railway run`).
- Real end-to-end test of the Connect → pick account → save flow against the live Meta app.
- Google Ads: identical OAuth pattern (`lib/google-ads.ts`, connect/callback/accounts routes,
  `ListAccessibleCustomers` against the MCC) plus the campaign-metrics sync into the `Campaign`
  model (spend/CTR/CPL/conversions per `prd.md` §11.2) once an account is selected on both
  platforms.

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

# WhatsApp Nurture Template Plan (Finalized — Code Wired)

Submission-ready spec for Nexora's WATI-based lead nurturing across multiple
properties, cities, and campaign (`sourceTab`) values.

## Status

**Code side: fully wired, typechecked clean, verified against all 15 real tabs
in the live Citadel sheet.** Nothing left to build for this phase.

**Your side: create 6 templates in WATI.** Until they're approved, sends
automatically fall back to a free-text message (honest wording, no template
needed) — nothing breaks while you wait on approval. See the checklist below.

Decisions locked:

- **5 nurture stages** (initial + day1/3/5/7) — the cadence already coded.
- **First touch is source-aware too** — re-submit `nexora_initial_response`; keep
  the current approved 2-var version live as fallback until the new one clears.
- **Post-call touch is a separate 6th template** (`nexora_post_call`) — fired
  automatically right after Priya's AI call ends successfully.
- **Label (`{{3}}`) is AI-generated from the start**, with a mandatory
  deterministic fallback so a missing/failing OpenAI key never blocks a send.

## Core Idea

Only one thing in a nurture message genuinely changes per campaign: the **enquiry
label**. Everything else (structure, CTA) is fixed text. So all source-awareness
lives in variables inside **one 4-variable template family** — the smallest
possible template set *and* the safest for Meta approval.

- Do **not** create one template per campaign tab.
- Do **not** rely on fully AI-written message bodies.
- One 4-variable family covers every campaign tab, both room + event, all
  properties and cities — **verified against all 15 real tabs in the live
  Citadel sheet** (Wedding, Kitty Party, Presidential Suite, Corporate,
  Anniversary, Retirement, Birthday, Engagement, Sunday Brunch, veg wedding,
  Small Events, FNB Ipl Leads, Polia Boishakh Leads, MothersDay Lead, South
  Indian Feast — every one produces a clean, professional sentence).

Net: **6 WATI templates total** for all nurturing. Post-event
(`nexora_post_event_*`) and broadcast (`nexora_broadcast_general`) are separate,
already-existing flows — out of scope here, not part of this 6.

## Variables

Every one of the 6 templates uses the same four variables, always in this order:

- `{{1}}` = lead name
- `{{2}}` = property name (multi-property / multi-city safe)
- `{{3}}` = source-aware enquiry label, e.g. `Kitty Party`, `Presidential Suite`,
  `Wedding` (cleaned tab name, or an AI-refined phrase when `OPENAI_API_KEY` is set)
- `{{4}}` = value hook — `packages, availability and venue details` (EVENT) or
  `room options, rates and availability` (STAY)

Approval discipline (matches the already-approved `nexora_initial_response`):

- **Marketing** category, **English (US)** language.
- No emoji, no heavy formatting.
- **Never end the body on a variable** — every template closes on fixed text.
- No header, no footer, no buttons on any of the 6.

---

## ✅ WATI Action Checklist — do this for each of the 6 templates

For every template below: **WATI → Broadcast → Templates → New Template**, then:

1. **Name** — enter it **exactly** as given (lowercase, underscores, no spaces).
   This must match `lib/whatsapp.ts`'s `WATI_TEMPLATES` map exactly, or the send
   will fail. If you want a different name, set the matching env var instead
   (see "If you name a template differently" below) — don't just rename it in
   WATI without also changing the code/env var.
2. **Category** — `Marketing`.
3. **Language** — `English (US)`.
4. **Header** — none. Leave blank / "None".
5. **Body** — paste the exact copy given for that template, including the
   `{{1}}`, `{{2}}`, `{{3}}`, `{{4}}` placeholders exactly as written.
6. **Sample values** — WATI/Meta requires an example value for every variable
   before it will submit for review. Use the sample values given under each
   template below (realistic, never placeholder junk like "test" — Meta reviewers
   reject templates with nonsense samples).
7. **Footer** — none.
8. **Buttons** — none.
9. Submit for review.

Repeat for all 6. **Submit all 6 in the same sitting** so their approval clocks
start together.

⚠️ **WATI's exact menu labels can shift over time** ("New Template" vs "Create
Template", where "Sample Values" appears in the form) — if what you see doesn't
match this exactly, the four things above (Name / Category / Language / Body +
samples) are still the fields to look for; the underlying Meta template
requirements don't change even if WATI's UI wording does.

### 1. `nexora_initial_response`

Re-submit this **new version** over the currently-approved 2-variable one. WATI
will keep sending the old approved version to real leads until this new one
clears review — nothing stops working while it's pending.

**Body:**
```text
Hi {{1}}, thank you for your {{3}} enquiry at {{2}}. I would be glad to help you with {{4}}. If convenient, we can arrange a quick call or visit to take this forward.
```

**Sample values:** `{{1}}` = `Rohan Sharma` · `{{2}}` = `Citadel Sarovar Portico Bangalore` · `{{3}}` = `Kitty Party` · `{{4}}` = `packages, availability and venue details`

### 2. `nexora_nurture_day1`

**Body:**
```text
Hi {{1}}, following up on your {{3}} enquiry at {{2}}. I can help you with {{4}}. Would a quick call work for you today?
```

**Sample values:** `{{1}}` = `Rohan Sharma` · `{{2}}` = `Citadel Sarovar Portico Bangalore` · `{{3}}` = `Wedding` · `{{4}}` = `packages, availability and venue details`

### 3. `nexora_nurture_day3`

**Body:**
```text
Hi {{1}}, checking in on your {{3}} plan at {{2}}. If you are comparing options, I can share {{4}}. Happy to arrange a call or visit whenever it suits you.
```

**Sample values:** `{{1}}` = `Priya Menon` · `{{2}}` = `Citadel Sarovar Portico Bangalore` · `{{3}}` = `Corporate` · `{{4}}` = `packages, availability and venue details`

### 4. `nexora_nurture_day5`

**Body:**
```text
Hi {{1}}, a quick update from {{2}} on your {{3}} enquiry. Our recent guests have really enjoyed their experience with us. Can I help you with {{4}} this week?
```

**Sample values:** `{{1}}` = `Amit Verma` · `{{2}}` = `Citadel Sarovar Portico Bangalore` · `{{3}}` = `Presidential Suite` · `{{4}}` = `room options, rates and availability`

### 5. `nexora_nurture_day7`

**Body:**
```text
Hi {{1}}, a final follow-up on your {{3}} enquiry at {{2}}. If you still need {{4}}, our team would be glad to help. You can reply here anytime to connect.
```

**Sample values:** `{{1}}` = `Neha Kapoor` · `{{2}}` = `Citadel Sarovar Portico Bangalore` · `{{3}}` = `Birthday` · `{{4}}` = `packages, availability and venue details`

### 6. `nexora_post_call`

Fired **immediately** when Priya's AI call ends on a successful conclusion (see
Post-Call Trigger below). "Priya" is fixed text in the body, so no extra
variable is needed for it.

**Body:**
```text
Hi {{1}}, Priya from {{2}} just connected with you about your {{3}} enquiry. As promised, I can help you with {{4}}. Reply here anytime and we will take it forward.
```

**Sample values:** `{{1}}` = `Sanjay Gupta` · `{{2}}` = `Citadel Sarovar Portico Bangalore` · `{{3}}` = `South Indian Feast` · `{{4}}` = `packages, availability and venue details`

**This one is the highest priority to get approved.** A just-called lead
usually has no open 24-hr WhatsApp session window, so the free-text fallback
often can't deliver — this template is what actually makes the post-call
message land.

### If you name a template differently in WATI

Every one of the 6 names has an env var override already wired in
`lib/whatsapp.ts`, so you don't have to use these exact strings — you just have
to set the matching var on the `nexora` Railway service if you deviate:

| Template | Env var override |
|---|---|
| `nexora_initial_response` | `WATI_TEMPLATE_INITIAL_RESPONSE` |
| `nexora_nurture_day1` | `WATI_TEMPLATE_NURTURE_DAY1` |
| `nexora_nurture_day3` | `WATI_TEMPLATE_NURTURE_DAY3` |
| `nexora_nurture_day5` | `WATI_TEMPLATE_NURTURE_DAY5` |
| `nexora_nurture_day7` | `WATI_TEMPLATE_NURTURE_DAY7` |
| `nexora_post_call` | `WATI_TEMPLATE_POST_CALL` |

If you use the exact names above, **no env vars are needed** — they're already
the defaults in code.

---

## Post-Call Trigger (already wired, no action needed from you here)

When Priya's AI call ends and reports its outcome, `handleOutcomeUpdate()` in
`app/api/ai-calls/[id]/route.ts` fires this automatically:

- **Fires on a successful conclusion only** — `QUALIFIED` or `CALLBACK` (the lead
  actually engaged). Skipped for `NOT_QUALIFIED`, `VOICEMAIL`, `WRONG_NUMBER`,
  `UNKNOWN` (no real conversation — don't pester).
- **Sends `nexora_post_call` immediately** (not scheduled), then **cancels the
  pending cold `INITIAL_RESPONSE`** for that lead so they don't also get the
  generic "thank you for your enquiry" first-touch. The day1/3/5/7 drip continues
  untouched.
- **Gated on `autoWhatsappNurtureEnabled`** — the same switch as all WhatsApp
  automation, set per property on `/whatsapp`. Both the AI-calling toggle
  (`/ai-calls`) and the WhatsApp toggle must be ON for a called lead to receive
  this.

So after all 6 are approved: `nexora_initial_response` is the first touch for
leads that were **not** successfully called (AI-calling off, no answer, wrong
number); `nexora_post_call` is the first touch for leads that **were**.

## Variable Generation (already wired, no action needed from you here)

### Track selection

`isRoomStayInquiry(sourceTab)` in `lib/whatsapp.ts` — reuses the **exact**
keyword set already in `calling-server/server.js` (suite / room / stay /
accommodation) so the WhatsApp track and the AI voice script branch identically.

- match → `STAY`
- otherwise → `EVENT`

### `{{4}}` value hook — deterministic, no AI

- `EVENT` → `packages, availability and venue details`
- `STAY` → `room options, rates and availability`

### `{{3}}` enquiry label — cleaned tab name, AI-refined when a key is set

`cleanTabLabel()` in `lib/whatsapp.ts` runs on every `sourceTab` **before**
anything else — this is a real fix, not a theoretical one, found by pulling the
actual 15 tabs from the live sheet:

- strips a trailing `Lead`/`Leads` word (three real tabs — `FNB Ipl Leads`,
  `Polia Boishakh Leads`, `MothersDay Lead` — would otherwise leak the internal
  CRM word "Leads" straight into a customer's WhatsApp message)
- collapses whitespace and Title Cases all-lowercase tab names (four real tabs
  — `wedding `, `veg wedding `, `corporate `, `Sunday Brunch ` — had trailing
  spaces / lowercase that read unprofessionally verbatim)
- leaves already-mixed-case names alone so acronyms like `FNB`/`IPL` are never
  mangled into `Fnb`/`Ipl`

`generateEnquiryLabel()` in `lib/openai.ts` takes the cleaned tab name and:

1. If `OPENAI_API_KEY` is set on `nexora`: asks `gpt-4o-mini` to turn it into a
   short, natural label (e.g. `Wedding` → `Wedding celebration`). Cached per
   `(track|tab|eventType)` at module level, so a bulk enroll of hundreds of
   leads makes at most one AI call per distinct campaign tab, not one per lead.
2. If the key is missing, the call errors, or the response is malformed: falls
   back to the **cleaned tab name itself** (e.g. `Kitty Party` stays `Kitty
   Party`) — never blocks a send, never produces broken/blank output.

---

## Implementation Shape In Code (reference — already done)

- `lib/whatsapp.ts` — `isRoomStayInquiry`, `nurtureTrack`, `buildNurtureHook`,
  `cleanTabLabel`, `WATI_TEMPLATES.POST_CALL`.
- `lib/openai.ts` — `generateEnquiryLabel` (AI + hard fallback, cached).
- `lib/automation.ts` — `createNurtureSequence` (4-var params, `sourceTab`
  input, honest free-text fallback with no photo/video promises);
  `sendPostCallWhatsApp` (sends `nexora_post_call`, cancels the pending
  `INITIAL_RESPONSE`, gated on `autoWhatsappNurtureEnabled`).
- `app/api/ai-calls/[id]/route.ts` — `handleOutcomeUpdate` calls
  `sendPostCallWhatsApp` on `QUALIFIED`/`CALLBACK`; `sourceTab` added to the
  lead `select`.
- `sourceTab` passed through all 4 nurture-enrollment call sites:
  `app/api/leads/route.ts`, `app/api/leads/import/route.ts`,
  `lib/sheet-sync.ts`, `app/api/whatsapp/bulk-nurture-trigger/route.ts`.

**Verified:** `npx tsc --noEmit` clean (only the 8 long-standing pre-existing
errors in `lib/auth.ts`/`lib/seeds/property-defaults.ts`/`prisma/seed.ts`/
`app/api/seed/route.ts`, untouched by this work). Cross-checked `cleanTabLabel`
and the track/hook logic against a live read-only probe of all 16 tabs in the
real Citadel sheet (`1xjzfXgRoYyb3sfCbwIcgJdrEKNFZRtIH71KEiJPM004`) — all 15
real tabs produce clean output, `Sheet18` correctly excluded as empty.

## Production Prerequisites

Nurturing is not "live" until both of these are done (both flagged in
`PROGRESS_LOG.md`):

1. **Set a real `OPENAI_API_KEY` on the `nexora` Railway service** — currently a
   placeholder. Without it, every label falls back to the cleaned tab name
   (still clean and professional, verified above — just not AI-polished).
2. **Railway cron for `POST /api/cron/process-messages`** — not running yet, so
   auto-scheduled nurture never fires; only the manual bulk-trigger sends. This
   is the gate on "nurturing actually runs on its own."

## Safe Rollout Order

1. **Submit all 6 templates to WATI** using the checklist above. Editing
   `nexora_initial_response` creates a new pending version — the old approved
   one keeps sending until the new one clears, so nothing breaks during review.
2. Set `OPENAI_API_KEY` on `nexora`; set up the cron.
3. Code is already merged and live — no further deploy needed for this phase
   beyond what's already shipped. It self-falls-back: if a template isn't
   approved yet, `sendTemplateMessage` fails and the cron/post-call path drops
   to the honest free-text message — so the switchover to templates is
   seamless the moment each one clears review.
4. Media pack (per-property brochure / hero image / short video) — deferred,
   separate phase, own decision later. Keep copy honest until then.

## Media Problem: Photos/Videos (deferred, by explicit decision)

Do not promise photos/videos until a property-specific media pack actually
exists — decided to revisit this later rather than build it now.

- AI caller: "we will share the relevant details on WhatsApp"
- WhatsApp templates: "I can help with {{4}}" (details / options / availability)
- Only mention photos/videos once the asset pipeline is built

Phase 2 media plan (not started):

1. maintain a per-property asset pack
2. store brochure URL, hero image URL, optional short video URL
3. send media only for properties with approved assets ready

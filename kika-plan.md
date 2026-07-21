# KIKA DES SUITES — Real-Estate Rental Vertical for the Voice Agent

**Plan for Sonnet 5 to implement. Analysis by Opus. Do NOT start coding until you have read
this whole document, then re-read the two "MUST NOT" sections.**

---

## 0. The one rule that governs everything

**The banquet calling experience must come out byte-for-byte identical after this change.**
Priya has been tuned across ~7 sessions (barge-in, closure/hang-up, anti-repetition, accent
tiers, audio buffering). None of that gets rewritten. We are **adding a second vertical
alongside** the banquet one, not generalising the banquet prompt into something abstract.

The safe way to guarantee this: the banquet path becomes the **default branch**, and its strings
are a **verbatim lift** of what's in `calling-server/server.js` today. If a banquet call's final
instruction string changes by even one character, the refactor is wrong.

---

## 1. Context

- **Existing system:** NEXORA's AI voice agent "Priya" calls banquet/wedding-hall leads,
  qualifies them (guest count, budget in lakhs, event date), and hands off. Prompt is built in
  `buildInstructions()` in `calling-server/server.js` (lines ~590–797). This is the **only** real
  prompt — `lib/calling-script.ts` is dead code (imported nowhere; leave it alone or delete
  separately, do not wire it in).
- **New client:** **Kika Des Suites** (`kikadessuites.co.ke`) — a Nairobi real-estate company
  that **rents out studio apartments**. Priya must call these leads as a **real-estate rental
  sales manager**, not a banquet coordinator. Goal per the client: understand intent
  (furnished vs unfurnished, budget, lease duration, unit type / BHK), build interest using real
  property facts (location, amenities, nearby schools/malls/offices, pricing), and drive toward a
  **physical site viewing**.
- **Confirmed with the user:**
  - Deal type = **long-term rental / lease** (not sale).
  - Primary call goal = **book a physical site viewing** (WhatsApp floor plans/rates as support).
  - Language = **neutral English** — Kenya already lands in the existing `NEUTRAL_ENGLISH` tier
    via `getLanguageTier(country)`. **No language/accent code changes needed.**

### Real facts about the Kika property (from their landing page — use to seed the Knowledge Base, NOT to hardcode)
- Location: Muthangari Drive, off Waiyaki Way, Westlands, Nairobi — next to Ecobank HQ.
- Unit type: **studio apartments, unfurnished**, open-plan, fitted kitchen, tiled floors.
- Rent: **120,000 KES/month**; deposit 2 months; flexible "monthly+" long-term lease; ready now.
- Amenities: 24/7 security + CCTV, gated compound, high-speed internet, on-site parking, backup
  generator, water supply, fitness centre, outdoor pool, cabro driveways, balcony w/ city views,
  walk-in shower + bathtub.
- Nearby: Loreto Convent / St. Austin's / Strathmore (schools); ABC Place / Sarit Centre /
  Westgate (malls); Westlands offices & UN HQ (business).
- Contact: +254 720 633 280, info@kikadessuites.co.ke.

> These facts change per client and over time. They belong in the **Knowledge Base**, not in the
> prompt code. See §6.

---

## 2. Architecture decision

Introduce a **property-level `vertical`** flag and refactor `buildInstructions()` into
**shared blocks + a small vertical "profile"**. This mirrors two patterns already in the codebase:

1. **`roomStay`** (`isRoomStayInquiry`, server.js:543) already swaps persona/opening/what-to-learn/
   closing between "banquet coordinator" and "guest-relations executive" while keeping everything
   else. This proves the slot-swap pattern works and is safe.
2. **`Property.country` and `Property.currency`** are already free-text per-property columns that
   flow through the `<Parameter>` pipeline and change Priya's behaviour. `vertical` is the exact
   same kind of column and rides the exact same pipeline.

**Why this over the alternatives (all rejected — do not do these):**
- ❌ *Fully DB-driven prompt template per property* — discards the tuned banquet structure, forces
  config on every existing client, huge blast radius.
- ❌ *Detect the vertical from `sourceTab` like `roomStay` does* — too fragile for an entire
  different business; misclassifying a banquet client as apartments would be catastrophic. A
  business type must be **explicit**, set once per property.
- ❌ *A second standalone calling-server for Kika* — duplicates all the hard-won barge-in /
  closure / audio-buffer machinery; two servers to keep in sync forever.
- ❌ *Add a `RENTAL` value to the `EventType` enum* — ripples into `eventTypeLabels`,
  `campaign-benchmarks.ts`, seeds, analytics. Unnecessary: vertical is property-level, so the
  apartments profile simply **ignores `eventType`**. Leave the `EventType` enum untouched.

`vertical` is free text with default `"banquet"`. Kika's property gets `"apartments"`. Every
existing property is `"banquet"` automatically → their calls hit the default branch → unchanged.

---

## 3. Implementation — step by step

### Step 1 — Schema (additive, no migration risk)
`prisma/schema.prisma`, on `model Property`, next to `country`/`currency`:

```prisma
// Business type this property runs, selecting the AI voice-agent persona + qualification flow.
// Free text (like `country`/`currency`), NOT an enum, so a new vertical never needs a migration.
// "banquet" (default) = the original banquet/event coordinator flow, unchanged for every existing
// client. "apartments" = Kika-style real-estate rental sales flow. Anything unrecognised falls
// back to "banquet".
vertical String @default("banquet")
```

Add `vertical` to `propertyUpdateSchema` in `lib/validations/settings.ts` (string, optional) and
allow it through `PATCH /api/settings/property`. Run `npx prisma db push` against local dev and
prod (same as the `currency` rollout). Default backfills every existing row to `"banquet"`.

### Step 2 — Pipeline: pass `vertical` to the calling server
`lib/ai-calling.ts`, in `initiateAiCall`:
- Add `vertical: true` to the `property` select.
- Push one param, right after the `country` param:
  ```ts
  ['vertical', property?.vertical ?? 'banquet'],
  ```
That's the whole pipeline change — it reads back out of `event.start.customParameters` in
`server.js` exactly like `country` does.

### Step 3 — calling-server: read the param + select a profile
`calling-server/server.js`:

1. Near the other `customParameters` reads (~line 366), add:
   ```js
   let vertical = url.searchParams.get('vertical') || 'banquet'
   // ... and in the start handler, alongside cp.country etc.:
   if (cp.vertical) vertical = cp.vertical
   ```
2. Thread `vertical` into the `buildInstructions({...})` call (line ~125) and into
   `configureSession` so the **tool** can be chosen by vertical too (see Step 5).

### Step 4 — Refactor `buildInstructions` into shared blocks + profile

**Do this as a pure refactor first, verify banquet output is identical, THEN add apartments.**

Identify the **vertical-specific slots** (everything else stays shared and is NOT duplicated):

| Slot | Banquet (existing, lift verbatim) | Apartments (new) |
|---|---|---|
| `personaLine` | "warm banquet coordinator" / room-stay variant | "warm, professional rental consultant / sales manager at {property}" |
| `roleObjective` | understand their event & gauge interest | understand their housing needs & build genuine interest, aiming toward a viewing |
| `enquiryLabel` | `sourceTab` / eventType / "a stay" | `sourceTab` or "a studio apartment" (never eventType) |
| `openingLine` | existing | "Hello, is this {name}? This is Priya from {property} — you enquired about renting one of our apartments, is that right? Do you have a couple of minutes?" |
| `knownParts` labels | Guest count / Budget (lakhs) / Event date | Move-in timing / Rent budget (in property currency) / Unit type / Furnished pref — only show what's actually on file |
| `decisionMakerGuidance` | existing | assume they decide for their own household; don't interrogate who "approves" |
| `whatToLearn` | event date / guests / budget | see §4 |
| `closingLine` | "venue photos, packages, pricing… senior colleague will call" | "send floor plans, availability and rent details on WhatsApp, and arrange a viewing at a time that suits you" |
| `report_outcome` tool | existing banquet tool | apartments tool (see §5) |

**Shared blocks that MUST remain single-sourced (do not fork, do not reword):** ACCENT & VOICE,
LANGUAGE (all three tiers), PERSONALITY & TONE, VARIETY, PACING, HANDLING INTERRUPTIONS,
OFF-TOPIC/OUT-OF-SCOPE, UNCLEAR AUDIO, ADDRESSING THE LEAD, LOCATION, KNOWLEDGE BASE, ENDING THE
CALL, BOUNDARIES. These are vertical-agnostic and already correct.

**Recommended shape:** a `VERTICAL_PROFILES` object keyed by vertical, each value supplying only
the slot strings/arrays above; `buildInstructions` picks
`const profile = VERTICAL_PROFILES[vertical] || VERTICAL_PROFILES.banquet` and slots them into the
one shared template. `roomStay` stays a sub-mode **inside** the banquet profile (it is a
hospitality nuance, unrelated to apartments). The apartments profile ignores `roomStay`.

**Currency:** the apartments budget label must use the property currency, not lakhs. Pass
`currency` (already available as a param — add it to the pipeline the same way if not already
threaded) and render Kenyan rent as e.g. `"KES 120,000/month"`, never `"₹1.2 lakhs"`. Reuse
`lib/format.ts` currency logic if practical; the lakhs formatter (`formatBudgetLabel`) is
banquet-only — do not call it in the apartments profile.

### Step 5 — Vertical-aware `report_outcome` tool
Keep the **required** fields identical across verticals: `outcome` (reuse the existing
`CallOutcome` values — `QUALIFIED` = interested/viewing-worthy, etc. — **no enum change**),
`qualifiedScore`, `notes`. Only the **optional captured detail fields** differ:

- Banquet tool: unchanged (`eventDate`, `guestCount`, `budgetRange`, `callbackTime`).
- Apartments tool: `moveInDate`, `leaseDurationMonths`, `budgetMonthlyRent`, `viewingInterest`
  (bool/text), `callbackTime`. (No `unitType` / `furnishedPreference` — scope is the unfurnished
  studio only, §5.2.)

`configureSession` selects `tools: [profile.outcomeTool]` by vertical.

**Outcome write-back — `app/api/ai-calls/[id]/route.ts` `handleOutcomeUpdate`:** this currently
formats banquet fields into the task description, lead notes, and `LeadActivity` metadata. Make it
**additively tolerant** of the apartment fields without changing the banquet formatting:
- Keep the existing banquet lines exactly as they are.
- When apartment fields are present, append them to the task description / notes / metadata using
  their own labels (e.g. `Rent budget: KES 120,000 | Unit: studio | Move-in: Aug | Furnished: no`).
- The stage-advance, task-creation, mogul round-robin assignment, and `sendPostCallWhatsApp`
  behaviour all stay the same — a QUALIFIED Kika lead should create the same "follow up" HIGH task
  (its title/description just carries rental details). **This gives you the "create a task"
  requirement for free — it already fires on QUALIFIED/CALLBACK/NOT_QUALIFIED.**

Do NOT repurpose `guestCount`→bedrooms etc. through the same JSON keys — use distinct keys so the
data stays honest and the banquet path is untouched.

### Step 6 — Task creation (already covered)
No new task system. The apartments QUALIFIED/CALLBACK outcomes reuse the existing task creation in
`handleOutcomeUpdate` (§5). If the client later wants a dedicated "Schedule viewing" task type,
that's a follow-up — MVP uses the existing HIGH follow-up task with rental details in the body.

---

## 4. Apartments `whatToLearn` (the qualification flow)

Conversational, reactive, never a form — same discipline as banquet. Only ask for what isn't
already on the lead's enquiry. Scope is **unfurnished studios only** (§5.2). Cover:
- **Budget** — monthly rent range they have in mind (in KES; ask gently). The studio is
  120,000 KES/month — she can state this from the KB when relevant.
- **Move-in timing** — when they want to move / how soon.
- **Lease duration** — how long they plan to stay.
- **Who's moving in** — self / couple — to build rapport and gauge fit for a studio; NOT to offer
  a bigger unit type (none exists).
- **Drive to viewing** — gauge readiness to visit; the close offers a viewing + WhatsApp details.

Do NOT ask furnished-vs-unfurnished and do NOT ask "how many BHK" as if larger units are on
offer — the only product is the unfurnished studio.

Priya uses Knowledge-Base facts (amenities, location, nearby schools/malls/offices, road
connectivity, pricing) to build genuine interest and answer questions — but only what the KB
states (§6).

---

## 5. Anti-hallucination guardrails (the user's explicit concern)

Appending a new vertical must not make Priya invent things. Protections:

1. **Facts come only from the Knowledge Base + `Property.city/address`.** The shared KNOWLEDGE BASE
   and LOCATION blocks already instruct: *"State ONLY what's listed here. Never invent or guess
   prices, capacities, dates, or policies."* Keep these blocks in the apartments path unchanged.
   Priya's ability to talk amenities/nearby/rent is powered by Kika's KB entries, not by anything
   hardcoded in the prompt.
2. **Unfurnished-only rule (CONFIRMED by user — scope lock for phase 1).** Kika's only offering
   Priya represents is **unfurnished studio apartments at 120,000 KES/month**. She must NOT probe
   "furnished or unfurnished" as an open choice and must NOT offer furnished units or multi-bedroom
   (1BHK/2BHK) units — that stock does not exist here. She positions the unfurnished studio
   directly and confidently. If a caller explicitly asks for furnished or a larger unit, she is
   honest ("right now these are unfurnished studios") and, if useful, says a colleague can confirm
   any other options — she never invents availability. `furnishedPreference` is therefore dropped
   from the apartments qualification flow and tool (see §4/§5).
3. **No invented distances/prices/policies.** Reuse the existing LOCATION rule ("never invent
   distances, travel times, or nearby landmarks that aren't part of what you know") and OFF-TOPIC
   rule verbatim.
4. **Keep turns short / don't dump the fact list** — the existing VARIETY/PACING rules already
   enforce this; they're shared, so they apply automatically.
5. **Profile isolation.** Because apartments is a separate profile object, none of its wording
   leaks into banquet calls and vice-versa. Nothing about "banquet", "event", "guests", "lakhs"
   should appear anywhere in the apartments instruction string — grep the built string in testing
   to confirm (see §8).

---

## 6. Knowledge Base — reuse, don't rebuild

The existing **Knowledge Base** feature (scrapes a client site into ~20 key facts per property,
fetched at call time via `GET /api/internal/knowledge-facts` and injected as the "ABOUT THE VENUE"
block) is exactly how Kika's amenities/location/nearby/pricing reach Priya. Implementation task is
**operational, not code**:
- Set Kika's `Property.city = "Nairobi"` (or "Westlands, Nairobi") and `Property.address` to the
  Muthangari Drive line, so the guaranteed LOCATION block is populated.
- Set `Property.currency = "KES"` and `Property.country = "Kenya"` and `Property.vertical =
  "apartments"`.
- Run the KB scraper against `kikadessuites.co.ke` so amenities/nearby/rent become key facts.
- Consider relabelling the KB block heading for apartments from "ABOUT THE VENUE" to "ABOUT THE
  PROPERTY" — trivial, optional, and only if it reads oddly; the instruction body is generic.

No new knowledge mechanism is required.

---

## 7. WhatsApp nurture & templates

**MVP: no new WATI templates strictly required.** `createNurtureSequence` / `sendPostCallWhatsApp`
already use a **generic 4-variable template family** — `{{1}}`=name, `{{2}}`=property,
`{{3}}`=enquiry label, `{{4}}`=value hook — where all context lives in the variables. Rental
context is fully expressible: `{{3}}` = "studio apartment", `{{4}}` = "floor plans, rent details
and a viewing".

To make this rental-aware without touching banquet:
- Extend `nurtureTrack(sourceTab)` (in `lib/whatsapp.ts`) and `buildNurtureHook` with a **RENTAL**
  track, selected when the property is apartments. Simplest: pass `vertical` into
  `createNurtureSequence`/`sendPostCallWhatsApp` and branch to a rental hook, rather than inferring
  from `sourceTab`. Keep the EVENT/STAY tracks exactly as they are.
- Extend `generateEnquiryLabel` (in `lib/openai.ts`) to return an apartment-appropriate label for
  the rental track (deterministic fallback: "apartment rental").
- The free-text session-fallback strings in those functions should get a rental variant so they
  don't say "event"/"venue" to a Kika lead.

**If the client wants distinct rental copy** ("we guys can create more templates on WATI"): add
Kika-specific approved templates and resolve template names by vertical (e.g. a per-vertical entry
in `WATI_TEMPLATES`, or per-property override). Keep the banquet template names as the default.
This is optional polish — the 4-var family works for MVP.

Nurture stays gated behind `Property.autoWhatsappNurtureEnabled` and the `AUTOMATION_HOURLY_CAP`
— do not weaken those. Same for AI calling behind `autoAiCallingEnabled`.

---

## 8. MUST NOT change / regression protection

- Do not modify the banquet instruction text. After the refactor, build a banquet call's
  instruction string and **diff it against a capture taken before the refactor** — must be
  identical. (Add a tiny throwaway `node` harness that calls `buildInstructions` with a banquet
  fixture and one with an apartments fixture; print both; commit neither.)
- Do not touch the shared blocks (accent, language tiers, variety, interruptions, closure/hang-up,
  audio buffering, ADDRESSING THE LEAD).
- Do not change the `EventType` enum, `eventTypeLabels`, or `campaign-benchmarks.ts`.
- Do not change the `CallOutcome` enum.
- Do not change the required `report_outcome` fields (`outcome`, `qualifiedScore`, `notes`) — only
  add optional apartment detail fields on the apartments tool variant.
- Do not weaken `autoAiCallingEnabled` / `autoWhatsappNurtureEnabled` gating or the hourly cap.
- Do not wire in `lib/calling-script.ts` (dead code).

---

## 9. Testing checklist

1. **Refactor-parity:** banquet instruction string identical pre/post refactor (diff harness).
2. **Apartments string sanity:** built apartments string contains none of: "banquet", "event",
   "guests", "lakh", "₹"; contains rental language + KES budget when on file.
3. `getLanguageTier("Kenya")` → `NEUTRAL_ENGLISH`; `getVoice` → `marin`. (Confirms no Hinglish.)
4. Seed a Kika test property (`vertical="apartments"`, `country="Kenya"`, `currency="KES"`,
   city/address set), scrape its KB, create a test lead, place a real call to the verified test
   number → Priya opens as a rental consultant, asks furnished/budget/move-in/unit-type/duration,
   uses KB amenities, drives to a viewing, gives a clean goodbye, hangs up.
5. Outcome write-back: QUALIFIED apartments call creates the HIGH follow-up task with rental
   details in the body; `LeadActivity` metadata carries the rental fields; no banquet field
   formatting appears.
6. A banquet property call in the same deploy is unchanged (spot-check a real banquet lead).
7. `npx tsc --noEmit` and `npx next build` clean (same known pre-existing errors only).
8. `npx prisma validate` clean; `db push` applied `Property.vertical` to dev + prod.

---

## 10. Deployment

Both services, `railway up --detach` **from repo root** (never from `calling-server/` — see the
recurring Root Directory gotcha in PROGRESS_LOG):
1. `railway link --service nexora && railway up --detach`
2. `railway link --service helpful-insight && railway up --detach`
Then `npx prisma db push` for `Property.vertical` (use `DATABASE_PUBLIC_URL` host/port for prod).

---

## 11. Open questions (confirm with user before/with build, don't fabricate)

1. ~~Furnished / BHK probing~~ — **RESOLVED: phase 1 is unfurnished studios only.** Priya does
   not probe furnished-vs-unfurnished and does not offer larger units (§5.2, §4, §5).
2. Viewing scheduling: does Priya just express intent + hand to the team (MVP), or should she
   attempt to pin a specific day/time on the call? Plan assumes express-intent + team confirms.
3. Whether to invest in Kika-specific WATI templates now or ship on the generic 4-var family (§7).
4. Exact Kenya lead source(s) / sheet columns for Kika, so the sheet-sync maps them (out of scope
   for the voice change, but needed for real lead flow).

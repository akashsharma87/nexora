# NEXORA — Knowledge Base Feature Plan

**Author:** Opus (planning) · **Implementer:** Sonnet · **Created:** July 14, 2026

> Implementation-ready spec. Build in the phases at the bottom, in order. Every file path,
> model, and endpoint below is written to match the patterns already in this repo — follow
> the existing conventions (see "How this fits the codebase") rather than inventing new ones.

---

## 1. Goal

Give each client property a **Knowledge Base** built by scraping the text of that client's own
website, so **Priya (the AI caller)** can talk confidently and accurately about the venue — its
halls, capacities, rooms, dining, amenities, location, USPs, policies — instead of only knowing
the single lead's enquiry.

**Core representation — a bounded list of "key facts".** Rather than prose or live retrieval, the
compile step distills the whole scraped site down to **~15–20 discrete, high-value key facts**
(each a short category + one-sentence fact). This is a deliberate design choice, not a fallback:

- It's a **one-time setup** at profile creation, so we can spend real LLM effort extracting the
  best facts once and store them structurally.
- Facts are **token-efficient, bounded, and predictable** — perfect for injecting into a realtime
  voice system prompt with no latency cost.
- A flat list is **easy for staff to review, correct, add to, or delete** item-by-item, unlike a
  prose blob.

**User flow:**
1. Owner/manager opens **Knowledge Base** (new sidebar item) for the active property.
2. Enters the client's website URL → clicks **Build Knowledge Base**.
3. Backend crawls the site (same-domain, bounded), extracts clean text per page, stores it, then
   uses the LLM to distill **~15–20 key facts** tailored for a phone agent.
4. Staff review/edit the key-fact list and add their own manual facts (offers, seasonal notes),
   then **Save**.
5. On every AI call, the calling server pulls that property's key facts and injects them as a
   clean bulleted list into Priya's system prompt, so she has real venue context.

**Non-goal (Phase 1–3):** live per-turn retrieval / vector search. For a realtime voice call,
latency matters and 15–20 facts fit straight into the system prompt. A retrieval tool is a
documented Phase 3 option only if a client ever needs a much larger KB.

---

## 2. How this fits the codebase (read before writing anything)

- **App:** Next.js 16 App Router + TypeScript, deployed as a **standalone Node server on Railway**
  (`next.config` standalone; see `railway.toml`). It is a **long-lived process**, NOT serverless —
  so a fire-and-forget async job started from a request keeps running. Use this.
- **DB:** Prisma + PostgreSQL. Schema at `prisma/schema.prisma`. Deploys run `npx prisma db push`
  on start (see `railway.toml [deploy].startCommand`), so a schema change ships by pushing code —
  no manual migration step. Still run `npm run db:push` locally first.
- **Multi-property:** every request resolves the **active property from a cookie** via
  `requireSession` (see how `app/api/projects/route.ts` and other scoped routes get the property).
  All KB routes MUST scope to the active property the same way — never take a raw propertyId from
  the client for owner-facing routes.
- **Roles:** `canManage(role)` from `lib/roles.ts` gates owner/manager-only actions (mirrors
  Settings). Executives can view the KB but not trigger scrapes/edits.
- **Background jobs:** existing pattern is a Railway cron hitting a secret-guarded endpoint every
  minute — see `app/api/cron/process-calls/route.ts` and the `[[cron]]` block in `railway.toml`.
  Reuse this pattern for the safety-net processor.
- **LLM:** `lib/openai.ts` already wraps the OpenAI SDK (`openai` v6, models `gpt-4o` /
  `gpt-4o-mini`) with a null-client fallback when `OPENAI_API_KEY` is unset. Add the key-fact
  extractor here; reuse `getClient()` and keep the graceful-fallback style. Do NOT add a second AI
  provider.
- **Calling server:** `calling-server/server.js` is a **separate** Node process (Railway service
  `helpful-insight`). It already calls back to the app at `NEXORA_APP_URL` with the header
  `x-calling-server-secret: CALLING_SERVER_SECRET` (see `reportOutcomeToNexora`). Reuse exactly this
  auth for the internal facts endpoint. Priya's system prompt is built in `buildInstructions(...)`
  in that file — that's where the key facts get injected.
- **Call context handoff:** `lib/ai-calling.ts → initiateAiCall` passes lead/property context to
  the calling server as Twilio `<Parameter>` elements. It already has `aiCall.propertyId`. Add
  `propertyId` as a parameter (do NOT try to stuff the facts through `<Parameter>` — size limits;
  the calling server fetches the facts itself).
- **UI form pattern:** copy the `country` field work (register form, Settings "Add Project" +
  Property edit, `lib/priya-country-suggestions.ts`) for the new `websiteUrl` field.

---

## 3. Library choices

Install (Phase 1):

```
npm i cheerio robots-parser p-limit ipaddr.js
```

- **`cheerio`** — server-side HTML parsing (jQuery-like). Fast, no browser. Primary text extractor.
- **`robots-parser`** — respect the target site's `robots.txt`.
- **`p-limit`** — cap crawl concurrency (politeness + memory).
- **`ipaddr.js`** — SSRF guard: classify resolved IPs as private/reserved and block them.

**Crawling:** use a small **custom BFS crawler** built on native `fetch` + `cheerio` (sketch in
§5). Rationale: hospitality sites are overwhelmingly server-rendered; a custom crawler is ~150
lines, has zero heavy deps, and is fully controllable on Railway. **Do NOT pull in Playwright or a
headless browser in Phase 1** — the browser binaries bloat the image and most target sites don't
need JS rendering.

**Optional / documented alternatives (only if a real client site turns out to be JS-only):**
- `crawlee` (`CheerioCrawler`) — batteries-included queue/dedup/retries/robots if the custom
  crawler proves fragile. Heavier dep; adopt only if needed.
- `@mozilla/readability` + `jsdom` — better main-content extraction (drops nav/footer boilerplate
  cleanly). Nice upgrade to §5's extractor; adds `jsdom` (moderately heavy). Phase 2+ if the
  cheerio-strip output is noisy.
- Playwright headless crawl — Phase 3, JS-rendered sites only, behind a flag.

**Token bounding:** don't add a tokenizer dep in Phase 1 — use a char budget (`~4 chars/token`)
and hard-cap the fact count + per-fact length (see §5.4). If precise token counts are needed later,
add `gpt-tokenizer` (pure-JS, no native build).

---

## 4. Data model (`prisma/schema.prisma`)

Add two models + one enum, and extend `Property`.

```prisma
model Property {
  // ... existing fields ...
  websiteUrl     String?           // client's public website; source for the knowledge base
  knowledgeBase  KnowledgeBase?
}

model KnowledgeBase {
  id            String          @id @default(cuid())
  propertyId    String          @unique
  sourceUrl     String?         // the URL last scraped (mirrors Property.websiteUrl at scrape time)
  status        KnowledgeStatus @default(EMPTY)
  pagesScraped  Int             @default(0)
  // THE payload Priya uses. A JSON array of ~15–20 key facts, each:
  //   { "category": "Event Spaces", "fact": "Grand Ballroom seats 400 / 700 floating.",
  //     "source": "scrape" | "manual" }
  // `source` lets a re-crawl replace only scrape-derived facts while PRESERVING hand-added ones,
  // so staff edits/additions are never wiped. This is the ONLY field the calling server reads.
  keyFacts      Json?
  factsCount    Int             @default(0)  // for list display / status card
  lastScrapedAt DateTime?
  error         String?         // populated on FAILED
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  property      Property        @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  pages         KnowledgePage[]
}
```

> **Why a flat fact list instead of prose:** bounded size (hard cap ~20), trivially editable in the
> UI (add/edit/delete one fact), token-cheap, and Priya reads it as a scannable list. `category` is
> just a short label for grouping in the UI/prompt (e.g. `Overview`, `Location`, `Event Spaces`,
> `Rooms`, `Dining`, `Amenities`, `USP`, `Policies`, `Contact`) — the list stays flat, ~15–20 items.

```prisma
model KnowledgePage {
  id              String        @id @default(cuid())
  knowledgeBaseId String
  url             String
  title           String?
  content         String        @db.Text  // cleaned plain text (boilerplate stripped)
  contentHash     String                  // sha256 of content; skip near-dupe boilerplate pages
  wordCount       Int           @default(0)
  createdAt       DateTime      @default(now())
  knowledgeBase   KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  @@unique([knowledgeBaseId, url])
  @@index([knowledgeBaseId])
}

enum KnowledgeStatus {
  EMPTY       // no scrape yet
  PENDING     // queued, runner not started
  PROCESSING  // crawl/compile in progress
  READY       // key facts available
  FAILED      // see `error`
}
```

Run `npm run db:push` locally; production picks it up via the start command.

---

## 5. Backend — scraping & compile pipeline

New folder `lib/knowledge/`:

| File | Responsibility |
|------|----------------|
| `lib/knowledge/ssrf.ts` | URL validation + SSRF guard (public http/https only). |
| `lib/knowledge/crawl.ts` | Bounded same-domain BFS crawler → raw HTML per page. |
| `lib/knowledge/extract.ts` | HTML → clean plain text + title. |
| `lib/knowledge/compile.ts` | Pages → LLM-extracted, capped list of ~15–20 key facts (in `lib/openai.ts` style). |
| `lib/knowledge/runner.ts` | Orchestrator `runKnowledgeJob(propertyId)`: drives status transitions. |

### 5.1 SSRF guard (`ssrf.ts`) — do this first, it's a security control

`assertPublicHttpUrl(rawUrl)`:
- Parse with `new URL()`. Reject non-`http:`/`https:` protocols.
- Reject when hostname is `localhost`, `*.local`, or an IP literal in a private/reserved range.
- **DNS-resolve the hostname and check every resolved IP** with `ipaddr.js` `.range()`; reject
  `private`, `loopback`, `linkLocal`, `uniqueLocal`, `reserved`, and the cloud metadata IP
  `169.254.169.254`. This must run again per-URL inside the crawler (a page can redirect to an
  internal host). Reject non-standard ports (allow 80/443 only).
- Throw a typed error the API surfaces as a clean 400.

### 5.2 Crawler (`crawl.ts`)

Custom BFS, `fetch` + `cheerio`, `p-limit` for concurrency. Config via env (§9) with safe defaults:

- `maxPages` (default **60**), `maxDepth` (default **3**), concurrency **4**, per-request timeout
  **10s**, total crawl budget **~4 min** (hard stop), max HTML bytes/page **~2 MB**.
- **Same registrable domain only** (allow `www.` and subdomains of the seed host; never wander off
  to external domains). Normalize URLs (strip fragments, trailing slashes, dedupe query-only diffs).
- Respect `robots.txt` via `robots-parser`; send a descriptive `User-Agent` (env
  `KNOWLEDGE_USER_AGENT`, default `NexoraKnowledgeBot/1.0 (+https://internetmoguls.com)`).
- Skip non-HTML by extension/content-type (`.pdf .jpg .png .zip .mp4 …` → skip in Phase 1; PDFs are
  Phase 3). Polite: small delay between requests per host.
- Re-run the SSRF check on each fetched URL (post-redirect). Yield `{ url, html, title }` per page.

### 5.3 Extractor (`extract.ts`)

`extractText(html): { title, text, wordCount }`:
- Load in cheerio; **remove** `script, style, noscript, svg, nav, header, footer, aside, form,
  iframe, [role=navigation]`, cookie/consent banners.
- Prefer `main`/`article` content; else `body`. Collapse whitespace, keep paragraph breaks, drop
  runs shorter than ~2 words (menu fragments). Cap per-page text (e.g. 20k chars).
- `contentHash = sha256(text)`; the runner skips pages whose hash already exists for this KB
  (kills repeated boilerplate pages).
- *(Optional upgrade, Phase 2:* try `@mozilla/readability` first, fall back to this.)*

### 5.4 Key-fact extractor (`compile.ts`, lives with `lib/openai.ts` conventions)

`extractKeyFacts({ propertyName, pages }): Promise<KeyFact[]>` where
`KeyFact = { category: string; fact: string; source: 'scrape' }`.

- If no OpenAI client (`getClient()` null) → **deterministic fallback**: derive a handful of facts
  from the highest-word-count pages (property name + first strong sentences per page, tagged with a
  best-guess category). Never block the feature on a missing key — same philosophy as the rest of
  `lib/openai.ts`.
- **Map step:** if combined page text exceeds the model context budget, run in batches (group pages
  until ~12k chars/batch); ask each batch for its candidate facts.
- **Reduce step:** one final call that **dedupes, ranks, and returns the top ~15–20 facts** as
  strict JSON (`response_format: { type: 'json_object' }`, `{ "facts": [{category, fact}] }`).
  Prioritize what a phone agent needs to answer confidently, roughly in this order: venue overview
  & positioning → location/access/parking → **event spaces with names + capacities** → rooms/stay
  → dining/catering (veg/non-veg, bar, in-house vs outside) → key amenities → signature USPs →
  concrete policies (timings, alcohol, decor, payment — only if stated) → contact/handoff.
- **Rules baked into the prompt:**
  - *Each fact ≤ ~160 chars, one specific idea, self-contained.*
  - *Only facts present in the provided text. NEVER invent prices, capacities, names, or policies.*
  - *Prefer specific, quotable facts (numbers, names) over vague marketing lines.*
  - *Return between 12 and 20 facts; fewer is fine if the site is thin — do not pad.*
- **Hard caps (code-enforced after the LLM returns):** max `KNOWLEDGE_MAX_FACTS` (default **20**)
  facts; each fact truncated to `KNOWLEDGE_FACT_MAX_CHARS` (default **200**). Tag every returned
  fact `source: 'scrape'`.

**Merge with manual facts (in the runner, not here):** when saving, replace only `source:'scrape'`
facts and keep existing `source:'manual'` ones, so a re-crawl never wipes hand-added facts. Manual
facts still count toward the display but the ~20 cap applies to scrape facts.

### 5.5 Runner (`runner.ts`)

`runKnowledgeJob(propertyId)`:
1. Set `status = PROCESSING`, clear `error`.
2. Crawl → extract → upsert `KnowledgePage` rows (dedupe by `contentHash`); track `pagesScraped`.
3. `extractKeyFacts(...)` → **merge** the returned `source:'scrape'` facts with any existing
   `source:'manual'` facts (see §5.4) → save `keyFacts`, `factsCount`, `lastScrapedAt`,
   `status = READY`.
4. On any throw → `status = FAILED`, `error = message`. Never let it crash the process (wrap in
   try/catch; it runs detached).
5. **Regenerate-only** variant `recompileFacts(propertyId)` skips crawling and re-extracts facts
   from the existing stored pages, then re-merges with manual facts (for the "Regenerate facts"
   button — useful after tuning, without re-hitting the site).

---

## 6. Where the job runs

**On-demand detached + cron safety-net** (fits the persistent-server + existing-cron patterns):

- `POST /api/knowledge/scrape` validates, sets `status = PENDING`, then **kicks
  `runKnowledgeJob` fire-and-forget** (`void runKnowledgeJob(id).catch(logOnly)`) and returns
  immediately. The UI polls status. Because Railway runs a persistent process, the job keeps going
  after the response is sent.
- **Cron safety-net** `POST /api/cron/process-knowledge` (guard: `x-cron-secret === CRON_SECRET`):
  - Reset **stale** rows: `PROCESSING` older than ~15 min (`updatedAt`) → `FAILED` ("timed out /
    server restarted") so they don't hang forever.
  - Pick up any `PENDING` not yet advanced (e.g. process died before the async runner started) and
    run one. `take: 1` per tick to bound load.
  - Add the `[[cron]]` entry to `railway.toml` (copy the `process-calls` line).

This gives instant start for the happy path **and** recovery if a deploy/restart interrupts a job.

---

## 7. API endpoints

All owner-facing routes resolve the active property via `requireSession` and gate writes with
`canManage`. Return shapes are suggestions — match existing route style.

| Method / path | Auth | Purpose |
|---|---|---|
| `GET /api/knowledge` | session | Active property's KB: `{ status, sourceUrl, pagesScraped, factsCount, lastScrapedAt, error, keyFacts: [{category,fact,source}], pages: [{url,title,wordCount}] }`. EMPTY shape if none. |
| `POST /api/knowledge/scrape` | canManage | Body `{ websiteUrl }`. `assertPublicHttpUrl` → persist `Property.websiteUrl` + `KnowledgeBase.sourceUrl`, upsert KB `PENDING`, kick runner. 400 on bad/blocked URL. |
| `POST /api/knowledge/recompile` | canManage | Re-extract facts from stored pages (no crawl); re-merge with manual facts. |
| `PATCH /api/knowledge` | canManage | Body `{ keyFacts: [{category,fact,source}] }` — save the staff-edited list (add/edit/remove/reorder). Enforce caps; recompute `factsCount`. |
| `DELETE /api/knowledge` | canManage | Delete KB + pages (cascade), reset to EMPTY. |
| `POST /api/cron/process-knowledge` | CRON_SECRET | Safety-net (see §6). |
| `GET /api/internal/knowledge-facts?propertyId=…` | `x-calling-server-secret` | **Calling server only.** Returns `{ facts: [{category,fact}] \| null }` from `keyFacts` **only if `status === READY`**, else `null`. Small, fast, one indexed read. (The calling server renders the bullet list — see §9.) |

> The internal endpoint is the only one that takes a raw `propertyId` — it's server-to-server and
> secret-guarded, exactly like the existing `PATCH /api/ai-calls/[id]` callback.

---

## 8. Frontend

### 8.1 Sidebar (`components/sidebar.tsx`)
Add to `mainMenuItems`, after **AI Calls**:
```ts
{ icon: BookOpen, label: 'Knowledge Base', href: '/knowledge', id: 'knowledge' },
```
Import `BookOpen` from `lucide-react`.

### 8.2 Page `app/knowledge/page.tsx` (client component)
Use `DashboardLayout`, `useActiveProject`, `@tanstack/react-query`, `react-hot-toast` — mirror
`app/settings/page.tsx`. Sections:
- **Source URL** input (prefilled from `websiteUrl`) + **Build / Rebuild Knowledge Base** button
  (disabled unless `canManage`).
- **Status card**:
  - `PENDING`/`PROCESSING` → spinner + "Scraping… N pages so far"; **poll `GET /api/knowledge`
    every ~3s** while in these states (react-query `refetchInterval`), stop when `READY`/`FAILED`.
  - `READY` → last scraped time + page count + "N key facts".
  - `FAILED` → red banner with `error` + **Retry**.
- **Key facts editor** — the main surface. Render `keyFacts` as an editable list, each row =
  a small `category` input/select + a `fact` text input + a delete (✕) button. **Add fact** button
  appends a blank `source:'manual'` row. **Save** (`PATCH`) persists the whole list.
  - Visually distinguish `manual` vs `scrape` facts (e.g. a small "added by team" tag) so staff
    know which survive a re-crawl.
  - Show a live count with the cap (e.g. "18 / 20") and warn when over.
  - **Regenerate facts** button (`POST /recompile`) re-extracts scrape facts from stored pages
    (keeps manual ones); confirm since it overwrites scrape-fact edits.
- **Scraped pages** — collapsible list (title · url · word count) for transparency.
- **Delete** knowledge base (confirm).
- Executives: read-only (hide mutating buttons/inputs via `canManage`).

### 8.3 `websiteUrl` field on property forms
Add a Website URL input (copy the `country` field treatment) to:
- Settings → **Property edit** form (`app/settings/page.tsx`) — primary.
- Settings → **Add Project** form + `POST /api/projects` (persist `websiteUrl`).
- Register form + `POST /api/register` (optional, nice-to-have).
Caption: *"Priya uses this to build a knowledge base so she can answer questions about the venue."*

---

## 9. Wiring the key facts into Priya

### 9.1 `lib/ai-calling.ts`
In `initiateAiCall`, add to the `<Parameter>` list:
```ts
['propertyId', aiCall.propertyId],
```

### 9.2 `calling-server/server.js`
- In the Twilio `start` handler, read `cp.propertyId`.
- Add `fetchKnowledgeFacts(propertyId)`: GET `${NEXORA_APP_URL}/api/internal/knowledge-facts?propertyId=…`
  with header `x-calling-server-secret: CALLING_SERVER_SECRET`, **2.5s timeout**, returns `null` on
  any error/miss (graceful — never break or delay a call beyond the cap). **In-memory cache**
  (`Map<propertyId,{facts,ts}>`, ~10 min TTL) so back-to-back calls to one property don't refetch.
- Gate `configureSession()` so it also waits until the facts fetch has resolved (or its timeout
  fired) when `propertyId` is known — start the fetch the moment `start` delivers `propertyId` so
  it overlaps the OpenAI socket open. Same-region read is typically <150ms; the 2.5s cap bounds the
  worst case. If it misses, proceed exactly as today (no facts) — zero regression.
- Render the facts into a bulleted list (group by `category`) and pass it into
  `buildInstructions(...)`. Add this section only when there are facts:

  ```
  # ABOUT THE VENUE (KNOWLEDGE BASE — use naturally in conversation)
  These are verified facts about the venue. Use them to answer the lead's questions confidently
  and specifically. But:
  - Speak naturally — never read this list out or dump it. Pull in only what's relevant to what
    they actually ask.
  - State ONLY what's listed here. Never invent or guess prices, capacities, dates, or policies.
    If they ask something not covered below, warmly say your colleague will confirm the exact
    details (ties into the OFF-TOPIC rule).
  <rendered key-fact bullet list, grouped by category>
  ```
  Keep it consistent with the existing off-topic/handoff guidance already in the prompt.

---

## 10. Config / env vars

App service (Railway `nexora`):
- `KNOWLEDGE_MAX_PAGES=60`, `KNOWLEDGE_MAX_DEPTH=3`, `KNOWLEDGE_CRAWL_BUDGET_MS=240000`,
  `KNOWLEDGE_MAX_FACTS=20`, `KNOWLEDGE_FACT_MAX_CHARS=200`,
  `KNOWLEDGE_USER_AGENT="NexoraKnowledgeBot/1.0 (+https://internetmoguls.com)"`
  (all with in-code defaults, so unset is fine).
- Reuse: `OPENAI_API_KEY`, `CRON_SECRET`, `APP_URL`, `CALLING_SERVER_SECRET`, `NEXORA_APP_URL`.
- Add the `[[cron]]` block for `process-knowledge` to `railway.toml`.

Calling server (Railway `helpful-insight`): already has `NEXORA_APP_URL` + `CALLING_SERVER_SECRET`.
Nothing new required.

---

## 11. Security checklist (must-haves, not optional)

- **SSRF** guard on every fetched URL, including post-redirect (§5.1). This is the biggest risk —
  we fetch arbitrary user-supplied URLs server-side.
- `canManage` on every scrape/edit/delete; view allowed for all authenticated users of the property.
- Bounds: max pages, max depth, per-page byte cap, total time budget, concurrency cap.
- Respect `robots.txt`; honest descriptive User-Agent.
- Internal facts endpoint guarded by `CALLING_SERVER_SECRET`; returns nothing unless `READY`.
- Never scrape auth-gated/checkout pages; strip/skip anything behind a login form.
- Extraction prompt forbids fabricated facts; the fact list is count- and length-capped in code.

---

## 12. Phased execution

**Phase 1 — Capture & store (no AI yet)**
1. Schema: `Property.websiteUrl`, `KnowledgeBase`, `KnowledgePage`, `KnowledgeStatus`; `db:push`.
2. Install deps (§3). Build `ssrf.ts`, `crawl.ts`, `extract.ts`, `runner.ts` (crawl+store only;
   key facts = a simple placeholder, e.g. one fact per top page).
3. Endpoints: `GET /api/knowledge`, `POST /api/knowledge/scrape`, `DELETE /api/knowledge`, cron
   `process-knowledge` + `railway.toml` cron.
4. UI: sidebar item, `/knowledge` page (URL input, status/poll, pages list, delete), `websiteUrl`
   on Settings property edit.
5. **Verify:** scrape a real hotel site end-to-end; confirm pages stored, status transitions,
   stale-reset works, SSRF blocks `http://localhost`, `http://169.254.169.254`, private IPs.

**Phase 2 — Extract key facts & feed Priya**
6. `compile.ts` (`extractKeyFacts`, map-reduce, capped, deterministic fallback) in `lib/openai.ts`
   style; wire into runner with the scrape/manual merge; add `recompile` + `PATCH` (key-facts list)
   endpoints + the key-facts editor UI (add/edit/delete facts, manual tag, regenerate).
7. `GET /api/internal/knowledge-facts`; `propertyId` param in `lib/ai-calling.ts`; facts fetch +
   cache + bullet-list prompt injection in `calling-server/server.js`.
8. **Verify:** place a live test call to a property with READY key facts; confirm Priya answers a
   venue-specific question correctly and defers (doesn't fabricate) on something not in the facts.
   Confirm a property with **no** KB still calls exactly as today (no regression, no added latency).

**Phase 3 — Optional enhancements (only if needed)**
- PDF/brochure ingestion; `@mozilla/readability` extractor upgrade; Playwright fallback for
  JS-only sites; scheduled auto-refresh (cron re-crawl every N days); a `lookup_knowledge`
  realtime tool for very large KBs; per-page include/exclude toggles in the UI.

---

## 13. Testing checklist

- [ ] `db:push` clean; models relate correctly; cascade delete removes pages.
- [ ] SSRF: localhost, `*.local`, private/reserved IPs, metadata IP, non-http(s), odd ports → 400.
- [ ] Crawler stays on-domain, honors robots.txt, stops at maxPages/budget, dedupes boilerplate.
- [ ] Job resilience: kill/restart mid-crawl → cron resets stale `PROCESSING`; retry works.
- [ ] `OPENAI_API_KEY` unset → deterministic fallback facts, feature still usable.
- [ ] Fact list never exceeds `KNOWLEDGE_MAX_FACTS`; each fact ≤ `KNOWLEDGE_FACT_MAX_CHARS`.
- [ ] Manual (`source:'manual'`) facts survive a re-crawl / regenerate; only scrape facts refresh.
- [ ] Roles: executive can view, cannot scrape/edit/delete.
- [ ] Calling server: facts fetch cached; 2.5s timeout → graceful no-facts call; no-KB property
      behaves exactly as before (opening-line latency unchanged).
- [ ] Live call: Priya uses real venue facts; defers instead of inventing when asked something
      outside the fact list.

---

## 14. Open questions / assumptions (confirm with Abhinav)

- **One website == one property.** If a client runs multiple properties on one domain, Phase 1
  scrapes the whole site into that property's KB; per-property sectioning is out of scope now.
- **Refresh cadence:** manual rebuild in Phase 1. Auto-refresh is Phase 3.
- **~15–20 key facts (max 20, ≤200 chars each)** assumed a good balance for the realtime prompt —
  tune `KNOWLEDGE_MAX_FACTS` after a live test if Priya needs more/fewer.
- **WhatsApp (`lib/whatsapp.ts`) is NOT wired to the KB** in this plan — scope is the AI caller
  only, as requested. Feeding the facts into WhatsApp replies could be a follow-up.

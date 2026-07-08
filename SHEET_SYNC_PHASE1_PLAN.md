# Nexora — Sheet Sync Phase 1 Plan

**All-tabs Google Sheet import, zero manual column mapping.**

Created: July 8, 2026

---

## Goal

One Google Sheet → sync **every tab** in a single run → each lead lands with:
- the correct **event type** (derived from the tab name),
- the **exact campaign label** (`sourceTab` = tab name, shown as a chip on the lead card),
- **all row data preserved** (unmapped columns folded into notes),

…with **no per-tab column mapping** required from the user.

---

## Evidence base (real data)

Probed the live sheet `1xjzfXgRoYyb3sfCbwIcgJdrEKNFZRtIH71KEiJPM004`
("Citadel Bangalore - Leads") using the Railway service-account creds. Findings:

- **16 tabs, 15 real + 1 junk (`Sheet18`, empty).** All 15 real tabs have *different*
  header layouts (16 distinct signatures) → a single shared mapping is impossible.
- **Identity fields are only lexically different, not conceptually.** Name / Phone / Email
  exist in every tab, just spelled differently (`Name`/`name `/`full name `,
  `Ph Number`/`phone no`/`Phone Number`). → coverable by expanding the keyword matcher; **no
  LLM needed** for the fields that actually create a lead.
- **The tab name *is* the event type** ("Kitty Party", "Wedding", "Corporate"…). No column
  needed for it.
- **Budget absent in 14 of 15 tabs** (Presidential Suite = fixed price). → budget must be
  optional per tab.
- **Data-shape traps** (independent of mapping):
  - Guest counts are ranges/buckets, not integers: `under_20`, `200+`, `3–4_guests`,
    `4–10_(close family)`. Current `parseInt` mangles these.
  - Dates are often relative: `this_month`, `3+_months_away`, `today's_match` — not parseable
    to a calendar date.
  - Junk `Sheet18` and a Meta `<test lead…>` dummy row exist → must be skipped.

---

## Scope

**In scope:** all-tabs mode only. Single-tab connections stay exactly as they are.
**Not in scope (Phase 2):** OpenAI structured extraction of guest-count / date / budget from
semantic columns (cached-per-tab LLM layer). Phase 1 keeps that content in `notes`; add the LLM
layer later only if those fields need to be filterable/analytics-grade.

---

## Changes by file

### 1. `lib/google-sheets.ts` — smarter, still deterministic
- **Expand `autoDetectColumnMap` aliases** with real variants observed in the sheet:
  - phone: `ph number`, `phone no`, `phone number`
  - name: `full name`
  - guests: `no. of guest`, `guest count`, `expected guest count`, `squad`, `group size`,
    `how many guests`, `how many people`, `no of people`
  - street: `street add`, `street address` (feeds notes)
- **New `mapRowToLeadSmart(row, headers, tabName)`** that:
  - Derives `eventType` from **tab name** via `normalizeEventType(tabName)` (not a column).
  - Stores guest count **as-is when it's a range**; only `parseInt` when it's a clean integer.
  - Leaves `eventDate` null when the value is relative, instead of forcing a bad date.
  - **Concatenates every unmapped column** (`fup*`, `Follow Up`, `Remarks`, `Action`, `FP*`,
    occasion, date-preference, street, etc.) into `notes`, labelled — nothing is lost.

### 2. `app/api/integrations/[id]/sync/route.ts` — all-tabs import
- In all-tabs mode, use `mapRowToLeadSmart` per tab (auto-detect from that tab's own headers).
- **Skip junk:** empty/headerless tabs (`Sheet18`) and obvious Meta `<test lead…>` rows.
- Set `Lead.sourceTab` = tab name (already wired) and `eventType` from tab name.
- Return a **per-tab summary**: `tab → created / skipped / detected fields / ⚠ no phone`.

### 3. `app/api/integrations/test/route.ts` (reuse as preview)
- Given just a sheet URL, return **all tabs** with: row count, detected name/phone/email,
  derived event type, and a flag for any tab missing name/phone. Powers the preview table.

### 4. `app/settings/integrations/integrations-content.tsx` — new flow
- All-tabs connection = **name → Source (Meta/Google) → paste URL → Connect & Preview.**
- **No tab dropdown, no mapping screen.** Show the preview table (every tab + what was detected)
  → Save.
- Connections list + post-sync toast show the per-tab summary.

### 5. Verify + ship
- Dry-run the mapper against the live **Citadel** sheet (Railway-creds probe) → confirm all 15
  real tabs resolve name + phone and `Sheet18` is skipped — **before** deploying.
- `npx tsc --noEmit` + `npx next build` → commit → push → `railway up --service nexora` from repo
  root. Prod DB already has `Lead.sourceTab`.

---

## Default decisions (unless overridden)
- Keep the existing **single-tab** flow untouched — this only changes all-tabs mode.
- Reuse the `test` endpoint for preview rather than adding a new route.

---

## Deferred to Phase 2
- OpenAI (`gpt-4o-mini`) column/value inference for semantic fields (guest-count ranges → number,
  relative dates → real dates, occasion → event subtype), **inferred once per tab and cached** on
  the connection (keyed by header-hash), with keyword fallback and per-tab audit. Only if
  structured filtering on those fields is needed.

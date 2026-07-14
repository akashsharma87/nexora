import { getClient } from '@/lib/openai'

import type { KeyFact } from './types'

export type SourcePage = { url: string; title: string | null; text: string; wordCount: number }

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const MAX_FACTS = envInt('KNOWLEDGE_MAX_FACTS', 20)
const FACT_MAX_CHARS = envInt('KNOWLEDGE_FACT_MAX_CHARS', 200)
const BATCH_CHAR_BUDGET = 12_000

const CATEGORY_GUIDE =
  'Overview, Location & Access, Event Spaces, Rooms & Stay, Dining & Catering, Amenities, ' +
  'Signature/USP, Policies, Contact'

const EXTRACTION_RULES = `Rules (follow strictly):
- Only use facts explicitly present in the provided text. NEVER invent or guess prices,
  capacities, names, dates, or policies that aren't stated.
- Each fact must be a single, specific, self-contained idea, at most ~160 characters.
- Prefer specific, quotable facts (numbers, names, capacities) over vague marketing language.
- Prioritize in roughly this order: venue overview & positioning, location/access/parking,
  event spaces with names + capacities, rooms/stay options, dining & catering (veg/non-veg,
  bar, in-house vs outside catering), key amenities, signature USPs, concrete policies
  (timings, alcohol, decor, payment — only if stated), contact/handoff details.
- Use short category labels, e.g.: ${CATEGORY_GUIDE}.`

/**
 * Distills scraped website pages into a capped, structured list of key facts for Priya (the
 * AI caller) — a deliberate design choice over prose or live retrieval: bounded, cheap to
 * inject into a realtime voice prompt, and trivially staff-editable (see knowledge.md §1).
 *
 * Falls back to a deterministic (non-AI) extraction when no OpenAI key is configured, so the
 * feature never hard-blocks on a missing key — same philosophy as the rest of lib/openai.ts.
 */
export async function extractKeyFacts(params: {
  propertyName: string
  pages: SourcePage[]
}): Promise<KeyFact[]> {
  const { propertyName, pages } = params
  const usablePages = pages.filter((p) => p.text.trim().length > 0)
  if (usablePages.length === 0) return []

  const client = getClient()
  if (!client) return fallbackKeyFacts(usablePages)

  try {
    const batches = chunkPages(usablePages)

    let candidateFactsText: string
    if (batches.length <= 1) {
      // Small site — skip the map step and extract directly from the single batch.
      candidateFactsText = renderPagesForPrompt(batches[0] ?? usablePages)
    } else {
      const mapped = await Promise.all(
        batches.map((batch) => extractCandidatesFromBatch(client, propertyName, batch))
      )
      candidateFactsText = mapped
        .flat()
        .map((f) => `[${f.category}] ${f.fact}`)
        .join('\n')
      if (!candidateFactsText.trim()) return fallbackKeyFacts(usablePages)
    }

    const finalFacts = await reduceToFinalFacts(client, propertyName, candidateFactsText)
    if (finalFacts.length === 0) return fallbackKeyFacts(usablePages)
    return capFacts(finalFacts)
  } catch (err) {
    console.error('[knowledge/compile] extractKeyFacts failed, using fallback:', err)
    return fallbackKeyFacts(usablePages)
  }
}

function chunkPages(pages: SourcePage[]): SourcePage[][] {
  const batches: SourcePage[][] = []
  let current: SourcePage[] = []
  let currentChars = 0

  for (const page of pages) {
    if (current.length > 0 && currentChars + page.text.length > BATCH_CHAR_BUDGET) {
      batches.push(current)
      current = []
      currentChars = 0
    }
    current.push(page)
    currentChars += page.text.length
  }
  if (current.length > 0) batches.push(current)
  return batches
}

function renderPagesForPrompt(pages: SourcePage[]): string {
  return pages
    .map((p) => `--- PAGE: ${p.title ?? p.url} (${p.url}) ---\n${p.text}`)
    .join('\n\n')
    .slice(0, BATCH_CHAR_BUDGET * 2) // hard safety cap even if one page alone is huge
}

type RawFact = { category: string; fact: string }

async function extractCandidatesFromBatch(
  client: NonNullable<ReturnType<typeof getClient>>,
  propertyName: string,
  pages: SourcePage[]
): Promise<RawFact[]> {
  const prompt = `You are building a phone AI agent's knowledge base for a hospitality venue called "${propertyName}".
Below is scraped text from some pages of the venue's own website. Extract up to 20 candidate
facts a phone agent could use to answer a customer's questions confidently.

${EXTRACTION_RULES}

Reply with ONLY strict JSON: {"facts": [{"category": "...", "fact": "..."}]}

WEBSITE TEXT:
${renderPagesForPrompt(pages)}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1200,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  })

  return parseFactsJson(response.choices[0]?.message?.content)
}

async function reduceToFinalFacts(
  client: NonNullable<ReturnType<typeof getClient>>,
  propertyName: string,
  candidateFactsText: string
): Promise<RawFact[]> {
  const prompt = `You are finalizing a phone AI agent's knowledge base for a hospitality venue called "${propertyName}".
Below are candidate facts (or raw website text) gathered about the venue. Dedupe, rank by how
useful they are for a phone agent talking to a prospective customer, and return the best facts.

${EXTRACTION_RULES}
- Return between 12 and ${MAX_FACTS} facts. Fewer is fine if there isn't enough real material —
  do not pad with generic filler.

Reply with ONLY strict JSON: {"facts": [{"category": "...", "fact": "..."}]}

CANDIDATE MATERIAL:
${candidateFactsText.slice(0, BATCH_CHAR_BUDGET * 2)}`

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1600,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  })

  return parseFactsJson(response.choices[0]?.message?.content)
}

function parseFactsJson(raw: string | null | undefined): RawFact[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const facts = Array.isArray(parsed.facts) ? parsed.facts : Array.isArray(parsed) ? parsed : []
    return facts
      .filter((f: unknown): f is RawFact =>
        Boolean(f && typeof f === 'object' && 'fact' in f && typeof (f as RawFact).fact === 'string')
      )
      .map((f: RawFact) => ({
        category: typeof f.category === 'string' && f.category.trim() ? f.category.trim() : 'Overview',
        fact: f.fact.trim(),
      }))
      .filter((f: RawFact) => f.fact.length > 0)
  } catch {
    return []
  }
}

function capFacts(facts: RawFact[]): KeyFact[] {
  return facts.slice(0, MAX_FACTS).map((f) => ({
    category: f.category.slice(0, 40),
    fact: f.fact.slice(0, FACT_MAX_CHARS),
    source: 'scrape' as const,
  }))
}

// Deterministic, non-AI extraction used when OPENAI_API_KEY is unset — never blocks the
// feature. Picks the highest-word-count pages and takes a leading snippet from each, tagged
// with a best-guess category inferred from the URL/title.
function fallbackKeyFacts(pages: SourcePage[]): KeyFact[] {
  const ranked = [...pages].sort((a, b) => b.wordCount - a.wordCount).slice(0, MAX_FACTS)
  return ranked.map((page) => ({
    category: guessCategory(page.url, page.title),
    fact: firstSnippet(page.text, FACT_MAX_CHARS),
    source: 'scrape' as const,
  }))
}

function guessCategory(url: string, title: string | null): string {
  const haystack = `${url} ${title ?? ''}`.toLowerCase()
  if (/contact/.test(haystack)) return 'Contact'
  if (/(room|suite|stay|accommodation)/.test(haystack)) return 'Rooms & Stay'
  if (/(banquet|wedding|event|conference|meeting)/.test(haystack)) return 'Event Spaces'
  if (/(dining|restaurant|menu|cuisine|bar)/.test(haystack)) return 'Dining & Catering'
  if (/(amenit|facilit|spa|pool|gym)/.test(haystack)) return 'Amenities'
  if (/(location|direction|address|map)/.test(haystack)) return 'Location & Access'
  if (/(polic|faq|term)/.test(haystack)) return 'Policies'
  return 'Overview'
}

function firstSnippet(text: string, maxChars: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  let snippet = ''
  for (const sentence of sentences) {
    if ((snippet + ' ' + sentence).trim().length > maxChars) break
    snippet = (snippet + ' ' + sentence).trim()
  }
  return (snippet || text).slice(0, maxChars)
}

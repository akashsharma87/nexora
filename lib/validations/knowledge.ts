import { z } from 'zod'

// URL format only — the real safety check (SSRF guard, DNS resolution) happens in
// lib/knowledge/ssrf.ts at the point the URL is actually fetched, not here.
export const knowledgeScrapeSchema = z.object({
  websiteUrl: z.string().trim().min(1, 'Website URL is required'),
})

export const keyFactSchema = z.object({
  category: z.string().trim().min(1).max(60),
  fact: z.string().trim().min(1).max(300),
  source: z.enum(['scrape', 'manual']),
})

// Generous cap above KNOWLEDGE_MAX_FACTS (scrape facts are capped there) — this just bounds
// the total list (scrape + manual) against abuse, not the intended ~15-20 target size.
export const knowledgeFactsUpdateSchema = z.object({
  keyFacts: z.array(keyFactSchema).max(40),
})

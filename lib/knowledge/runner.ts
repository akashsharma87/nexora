import { prisma } from '@/lib/db'

import { extractKeyFacts } from './compile'
import { crawlSite } from './crawl'
import { extractText } from './extract'
import { UnsafeUrlError } from './ssrf'
import type { KeyFact } from './types'

type StoredPage = { url: string; title: string | null; text: string; wordCount: number }

/**
 * Full pipeline for a property's Knowledge Base: crawl the site, store cleaned page text,
 * extract key facts, merge with any staff-added manual facts, mark READY. Runs detached
 * (fire-and-forget from the API route) — Railway's persistent Node process keeps it alive
 * after the HTTP response is sent. Never throws; every failure path marks the KB FAILED with
 * a message instead of crashing the process.
 */
export async function runKnowledgeJob(propertyId: string): Promise<void> {
  const kb = await prisma.knowledgeBase.findUnique({ where: { propertyId } })
  if (!kb?.sourceUrl) {
    await markFailed(propertyId, 'No website URL configured.')
    return
  }

  await prisma.knowledgeBase.update({
    where: { propertyId },
    data: { status: 'PROCESSING', error: null },
  })

  try {
    const propertyName = await getPropertyName(propertyId)

    const crawled = await crawlSite(kb.sourceUrl, {}, (pagesSoFar) => {
      // Best-effort progress ping for the UI's polling status card — never let a transient
      // write failure here abort the crawl itself.
      prisma.knowledgeBase
        .update({ where: { propertyId }, data: { pagesScraped: pagesSoFar } })
        .catch(() => {})
    })

    await persistPages(kb.id, crawled)

    // Re-read the FULL current page set, not just what this crawl touched. If this crawl found
    // zero pages (site temporarily unreachable, robots.txt blocked us, etc.), persistPages
    // deliberately left prior pages untouched — facts must still be extracted from whatever
    // pages remain, not silently collapse to zero because of one bad/empty crawl.
    const allPages = await prisma.knowledgePage.findMany({ where: { knowledgeBaseId: kb.id } })
    const pagesForFacts: StoredPage[] = allPages.map((p) => ({
      url: p.url,
      title: p.title,
      text: p.content,
      wordCount: p.wordCount,
    }))

    const scrapeFacts = await extractKeyFacts({ propertyName, pages: pagesForFacts })
    await saveFacts(propertyId, scrapeFacts, { pagesScraped: allPages.length, sourceUrl: kb.sourceUrl })
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : 'Scrape failed — please try again.'
    console.error(`[knowledge] runKnowledgeJob failed for property ${propertyId}:`, err)
    await markFailed(propertyId, message)
  }
}

/**
 * Re-extracts key facts from already-stored pages, without re-crawling the site. Used by the
 * "Regenerate facts" button and by the stale-job cron safety net.
 */
export async function recompileFacts(propertyId: string): Promise<void> {
  const kb = await prisma.knowledgeBase.findUnique({ where: { propertyId }, include: { pages: true } })
  if (!kb) {
    await markFailed(propertyId, 'No knowledge base found for this property.')
    return
  }
  if (kb.pages.length === 0) {
    await markFailed(propertyId, 'No scraped pages to generate facts from — run a scrape first.')
    return
  }

  await prisma.knowledgeBase.update({
    where: { propertyId },
    data: { status: 'PROCESSING', error: null },
  })

  try {
    const propertyName = await getPropertyName(propertyId)
    const pages: StoredPage[] = kb.pages.map((p) => ({
      url: p.url,
      title: p.title,
      text: p.content,
      wordCount: p.wordCount,
    }))
    const scrapeFacts = await extractKeyFacts({ propertyName, pages })
    await saveFacts(propertyId, scrapeFacts, { pagesScraped: kb.pages.length, sourceUrl: kb.sourceUrl ?? undefined })
  } catch (err) {
    console.error(`[knowledge] recompileFacts failed for property ${propertyId}:`, err)
    await markFailed(propertyId, 'Could not regenerate facts — please try again.')
  }
}

async function getPropertyName(propertyId: string): Promise<string> {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } })
  return property?.name ?? 'the venue'
}

async function persistPages(
  knowledgeBaseId: string,
  crawled: { url: string; title: string | null; html: string }[]
): Promise<StoredPage[]> {
  const seenHashes = new Set<string>()
  const stored: StoredPage[] = []

  for (const page of crawled) {
    const extracted = extractText(page.html)
    if (!extracted.text) continue
    // Dedupe near-identical boilerplate pages (e.g. a site with 10 near-empty listing pages).
    if (seenHashes.has(extracted.contentHash)) continue
    seenHashes.add(extracted.contentHash)

    await prisma.knowledgePage.upsert({
      where: { knowledgeBaseId_url: { knowledgeBaseId, url: page.url } },
      create: {
        knowledgeBaseId,
        url: page.url,
        title: extracted.title,
        content: extracted.text,
        contentHash: extracted.contentHash,
        wordCount: extracted.wordCount,
      },
      update: {
        title: extracted.title,
        content: extracted.text,
        contentHash: extracted.contentHash,
        wordCount: extracted.wordCount,
      },
    })

    stored.push({ url: page.url, title: extracted.title, text: extracted.text, wordCount: extracted.wordCount })
  }

  // Drop pages that no longer appeared on this crawl (removed/restructured on the site) — but
  // ONLY when this crawl actually found something. If it found zero pages (site temporarily
  // unreachable, robots.txt blocked us, etc.), leave the previously-stored pages alone rather
  // than wiping a working knowledge base because of one bad/empty crawl.
  if (stored.length > 0) {
    const currentUrls = stored.map((p) => p.url)
    await prisma.knowledgePage.deleteMany({
      where: { knowledgeBaseId, url: { notIn: currentUrls } },
    })
  }

  return stored
}

async function saveFacts(
  propertyId: string,
  scrapeFacts: KeyFact[],
  meta: { pagesScraped: number; sourceUrl?: string }
): Promise<void> {
  // Merge with existing MANUAL facts so a re-crawl/regenerate never wipes staff-added facts —
  // only source:'scrape' facts are ever replaced by a fresh extraction.
  const existing = await prisma.knowledgeBase.findUnique({ where: { propertyId }, select: { keyFacts: true } })
  const manualFacts = parseFacts(existing?.keyFacts).filter((f) => f.source === 'manual')
  const merged: KeyFact[] = [...manualFacts, ...scrapeFacts]

  await prisma.knowledgeBase.update({
    where: { propertyId },
    data: {
      keyFacts: merged,
      factsCount: merged.length,
      pagesScraped: meta.pagesScraped,
      ...(meta.sourceUrl ? { sourceUrl: meta.sourceUrl } : {}),
      status: 'READY',
      lastScrapedAt: new Date(),
      error: null,
    },
  })
}

function parseFacts(raw: unknown): KeyFact[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is KeyFact =>
      Boolean(f && typeof f === 'object' && 'fact' in f && 'category' in f && 'source' in f)
  )
}

async function markFailed(propertyId: string, message: string): Promise<void> {
  await prisma.knowledgeBase
    .update({ where: { propertyId }, data: { status: 'FAILED', error: message } })
    .catch(() => {})
}

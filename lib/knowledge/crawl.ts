import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import robotsParser from 'robots-parser'

import { assertPublicHttpUrl } from './ssrf'

export type CrawledPage = {
  url: string
  title: string | null
  html: string
}

type CrawlOptions = {
  maxPages?: number
  maxDepth?: number
  concurrency?: number
  requestTimeoutMs?: number
  totalBudgetMs?: number
  maxHtmlBytes?: number
  userAgent?: string
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const DEFAULT_USER_AGENT = 'NexoraKnowledgeBot/1.0 (+https://internetmoguls.com)'

function resolveOptions(options: CrawlOptions): Required<CrawlOptions> {
  return {
    maxPages: options.maxPages ?? envInt('KNOWLEDGE_MAX_PAGES', 60),
    maxDepth: options.maxDepth ?? envInt('KNOWLEDGE_MAX_DEPTH', 3),
    concurrency: options.concurrency ?? 4,
    requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
    totalBudgetMs: options.totalBudgetMs ?? envInt('KNOWLEDGE_CRAWL_BUDGET_MS', 4 * 60 * 1000),
    maxHtmlBytes: options.maxHtmlBytes ?? 2 * 1024 * 1024,
    userAgent: options.userAgent ?? process.env.KNOWLEDGE_USER_AGENT ?? DEFAULT_USER_AGENT,
  }
}

// Non-HTML assets — Phase 1 skips these entirely (PDF ingestion is a documented Phase 3 option).
const SKIP_EXTENSIONS = /\.(pdf|jpe?g|png|gif|svg|webp|zip|rar|7z|mp4|mp3|wav|avi|mov|docx?|xlsx?|pptx?|css|js|mjs|ico|woff2?|ttf|eot|json|xml)(\?|#|$)/i

function normalizeUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    u.hash = ''
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    return u.toString()
  } catch {
    return null
  }
}

// "Same site" means same hostname ignoring a leading www. — deliberately NOT a full
// public-suffix-list registrable-domain check (no extra dep for Phase 1); good enough to
// keep the crawl on a client's own site without wandering to unrelated external domains.
function isSameSite(a: URL, b: URL): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, '')
  return strip(a.hostname) === strip(b.hostname)
}

async function fetchWithTimeout(url: string, userAgent: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Bounded, same-site, robots.txt-respecting BFS crawl. Every fetched URL — including the
 * post-redirect final URL — is re-validated through assertPublicHttpUrl so a same-site page
 * can never be used to pivot a fetch onto an internal host.
 */
export async function crawlSite(
  seedUrl: string,
  options: CrawlOptions = {},
  onPageCrawled?: (pagesSoFar: number) => void
): Promise<CrawledPage[]> {
  const opts = resolveOptions(options)
  const seed = await assertPublicHttpUrl(seedUrl)

  let robots: ReturnType<typeof robotsParser> | null = null
  try {
    const robotsUrl = `${seed.protocol}//${seed.host}/robots.txt`
    const res = await fetchWithTimeout(robotsUrl, opts.userAgent, opts.requestTimeoutMs)
    if (res.ok) robots = robotsParser(robotsUrl, await res.text())
  } catch {
    // No robots.txt or unreachable — proceed without a restriction (default-allow, per spec).
  }

  const startedAt = Date.now()
  const withinBudget = () => Date.now() - startedAt <= opts.totalBudgetMs
  const visited = new Set<string>()
  const seedNormalized = normalizeUrl(seed.toString()) ?? seed.toString()
  const queue: { url: string; depth: number }[] = [{ url: seedNormalized, depth: 0 }]
  const results: CrawledPage[] = []
  const limit = pLimit(opts.concurrency)

  async function processOne(url: string, depth: number): Promise<void> {
    if (results.length >= opts.maxPages || !withinBudget()) return
    if (visited.has(url)) return
    visited.add(url)
    if (SKIP_EXTENSIONS.test(url)) return
    if (robots?.isAllowed(url, opts.userAgent) === false) return

    let target: URL
    try {
      target = await assertPublicHttpUrl(url)
    } catch {
      return
    }
    if (!isSameSite(seed, target)) return

    let res: Response
    try {
      res = await fetchWithTimeout(url, opts.userAgent, opts.requestTimeoutMs)
    } catch {
      return
    }
    if (!res.ok) return

    // fetch() follows redirects transparently — re-validate the FINAL landing URL so a
    // same-site page can't be used to redirect the fetch onto an internal host.
    const finalUrl = res.url || url
    try {
      const finalTarget = await assertPublicHttpUrl(finalUrl)
      if (!isSameSite(seed, finalTarget)) return
    } catch {
      return
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return

    const declaredLength = Number(res.headers.get('content-length') ?? '0')
    if (declaredLength > opts.maxHtmlBytes) return

    const html = await res.text()
    if (Buffer.byteLength(html, 'utf8') > opts.maxHtmlBytes) return

    const $ = cheerio.load(html)
    const title = $('title').first().text().replace(/\s+/g, ' ').trim() || null
    results.push({ url: finalUrl, title, html })
    onPageCrawled?.(results.length)

    if (depth < opts.maxDepth) {
      const discovered: { url: string; depth: number }[] = []
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        try {
          const abs = new URL(href, finalUrl)
          const normalized = normalizeUrl(abs.toString())
          if (normalized && !visited.has(normalized) && !SKIP_EXTENSIONS.test(normalized)) {
            discovered.push({ url: normalized, depth: depth + 1 })
          }
        } catch {
          // malformed href — skip
        }
      })
      queue.push(...discovered)
    }
  }

  // Process in concurrency-capped waves rather than a strict single-URL-at-a-time BFS —
  // simpler than a full priority queue while still respecting maxPages/budget/politeness.
  while (queue.length > 0 && results.length < opts.maxPages && withinBudget()) {
    const batch = queue.splice(0, opts.concurrency)
    await Promise.all(batch.map(({ url, depth }) => limit(() => processOne(url, depth))))
  }

  return results
}

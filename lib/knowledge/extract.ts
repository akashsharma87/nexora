import { createHash } from 'node:crypto'

import * as cheerio from 'cheerio'

// Stripped before extraction — chrome/boilerplate that would otherwise pollute every page
// with the same nav/footer text and drown out the actual venue content.
const REMOVE_SELECTORS =
  'script, style, noscript, svg, nav, header, footer, aside, form, iframe, ' +
  '[role="navigation"], [aria-hidden="true"], .cookie, .cookie-banner, .consent, #cookie-banner'

// Prefer real block-level text (paragraphs, headings, list items, table cells) over a raw
// `.text()` dump — cheerio inserts no whitespace between block elements, so a plain body-text
// dump runs everything together with no paragraph breaks.
const BLOCK_SELECTORS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, dt, dd'

const MAX_TEXT_CHARS = 20_000

export type ExtractedPage = {
  title: string | null
  text: string
  wordCount: number
  contentHash: string
}

export function extractText(html: string): ExtractedPage {
  const $ = cheerio.load(html)
  $(REMOVE_SELECTORS).remove()

  const title = $('title').first().text().replace(/\s+/g, ' ').trim() || null

  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body')

  const blocks: string[] = []
  root.find(BLOCK_SELECTORS).each((_, el) => {
    const line = $(el).text().replace(/\s+/g, ' ').trim()
    // Drop menu/label fragments (single words) — real sentences carry the useful content.
    if (line && line.split(' ').length >= 2) blocks.push(line)
  })

  // Fallback for sites that don't use semantic block tags at all.
  const lines = blocks.length > 0
    ? blocks
    : root
        .text()
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0 && line.split(' ').length >= 2)

  const text = dedupeConsecutive(lines).join('\n').slice(0, MAX_TEXT_CHARS)
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const contentHash = createHash('sha256').update(text).digest('hex')

  return { title, text, wordCount, contentHash }
}

function dedupeConsecutive(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (out[out.length - 1] !== line) out.push(line)
  }
  return out
}

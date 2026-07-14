import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { runKnowledgeJob } from '@/lib/knowledge/runner'
import { assertPublicHttpUrl, UnsafeUrlError } from '@/lib/knowledge/ssrf'
import { knowledgeScrapeSchema } from '@/lib/validations/knowledge'

// POST /api/knowledge/scrape — validate the URL, persist it, queue the crawl+extract job, and
// return immediately. The job runs detached (Railway's Node process stays alive after the
// response is sent); the UI polls GET /api/knowledge for progress.
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Only owners and managers can build the knowledge base.' }, { status: 403 })
  }

  const parsed = knowledgeScrapeSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  let validatedUrl: URL
  try {
    validatedUrl = await assertPublicHttpUrl(parsed.data.websiteUrl)
  } catch (err) {
    const message = err instanceof UnsafeUrlError ? err.message : 'Invalid website URL.'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const propertyId = session.user.propertyId
  const sourceUrl = validatedUrl.toString()

  await prisma.property.update({ where: { id: propertyId }, data: { websiteUrl: sourceUrl } })

  // Upsert without touching keyFacts — a re-scrape must never clobber staff-added manual
  // facts before the job has even started; the job itself merges scrape facts with them.
  await prisma.knowledgeBase.upsert({
    where: { propertyId },
    create: { propertyId, sourceUrl, status: 'PENDING', pagesScraped: 0 },
    update: { sourceUrl, status: 'PENDING', pagesScraped: 0, error: null },
  })

  void runKnowledgeJob(propertyId).catch((err) => {
    console.error(`[knowledge/scrape] runKnowledgeJob threw for property ${propertyId}:`, err)
  })

  return NextResponse.json({ started: true, sourceUrl })
}

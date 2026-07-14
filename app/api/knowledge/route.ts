import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { knowledgeFactsUpdateSchema } from '@/lib/validations/knowledge'

// GET /api/knowledge — the active property's Knowledge Base, or an EMPTY shape if none exists yet.
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const propertyId = session.user.propertyId

  const [property, kb] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { websiteUrl: true } }),
    prisma.knowledgeBase.findUnique({
      where: { propertyId },
      include: { pages: { select: { url: true, title: true, wordCount: true }, orderBy: { url: 'asc' } } },
    }),
  ])

  if (!kb) {
    return NextResponse.json({
      status: 'EMPTY',
      websiteUrl: property?.websiteUrl ?? null,
      sourceUrl: null,
      pagesScraped: 0,
      factsCount: 0,
      lastScrapedAt: null,
      error: null,
      keyFacts: [],
      pages: [],
    })
  }

  return NextResponse.json({
    status: kb.status,
    websiteUrl: property?.websiteUrl ?? null,
    sourceUrl: kb.sourceUrl,
    pagesScraped: kb.pagesScraped,
    factsCount: kb.factsCount,
    lastScrapedAt: kb.lastScrapedAt,
    error: kb.error,
    keyFacts: kb.keyFacts ?? [],
    pages: kb.pages,
  })
}

// PATCH /api/knowledge — save the staff-edited key-facts list (add/edit/remove/reorder).
export async function PATCH(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Only owners and managers can edit the knowledge base.' }, { status: 403 })
  }

  const parsed = knowledgeFactsUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const propertyId = session.user.propertyId
  const keyFacts = parsed.data.keyFacts

  const kb = await prisma.knowledgeBase.upsert({
    where: { propertyId },
    create: {
      propertyId,
      keyFacts,
      factsCount: keyFacts.length,
      status: keyFacts.length > 0 ? 'READY' : 'EMPTY',
    },
    update: {
      keyFacts,
      factsCount: keyFacts.length,
      // Editing facts by hand on an otherwise-empty KB makes it usable — but never downgrade
      // an in-progress or failed scrape's status just because facts were edited mid-flight.
      ...(keyFacts.length > 0 ? { status: 'READY' as const } : {}),
    },
  })

  return NextResponse.json({ knowledgeBase: { keyFacts: kb.keyFacts, factsCount: kb.factsCount, status: kb.status } })
}

// DELETE /api/knowledge — remove the knowledge base and all scraped pages (cascade).
export async function DELETE() {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Only owners and managers can delete the knowledge base.' }, { status: 403 })
  }

  await prisma.knowledgeBase.deleteMany({ where: { propertyId: session.user.propertyId } })

  return NextResponse.json({ deleted: true })
}

import { NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { recompileFacts } from '@/lib/knowledge/runner'

// POST /api/knowledge/recompile — re-extract key facts from already-stored pages (no crawl),
// then re-merge with any manual facts. Used by the "Regenerate facts" button.
export async function POST() {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Only owners and managers can regenerate facts.' }, { status: 403 })
  }

  const propertyId = session.user.propertyId
  const kb = await prisma.knowledgeBase.findUnique({ where: { propertyId }, select: { id: true } })
  if (!kb) {
    return NextResponse.json({ error: 'No knowledge base found — run a scrape first.' }, { status: 400 })
  }

  await prisma.knowledgeBase.update({ where: { propertyId }, data: { status: 'PENDING', error: null } })

  void recompileFacts(propertyId).catch((err) => {
    console.error(`[knowledge/recompile] recompileFacts threw for property ${propertyId}:`, err)
  })

  return NextResponse.json({ started: true })
}

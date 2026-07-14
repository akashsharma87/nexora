import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'

// GET /api/internal/knowledge-facts?propertyId=... — calling-server ONLY. Guarded by the same
// shared secret used for the existing AiCall outcome callback (see app/api/ai-calls/[id]/route.ts
// → x-calling-server-secret). Returns facts only when the knowledge base is READY, so a call to
// a property mid-scrape or with no knowledge base just gets `null` and proceeds exactly as
// before — no partial/stale facts are ever handed to Priya.
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-calling-server-secret')
  if (!secret || secret !== process.env.CALLING_SERVER_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const propertyId = request.nextUrl.searchParams.get('propertyId')
  if (!propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })
  }

  const kb = await prisma.knowledgeBase.findUnique({
    where: { propertyId },
    select: { status: true, keyFacts: true },
  })

  if (!kb || kb.status !== 'READY' || !Array.isArray(kb.keyFacts) || kb.keyFacts.length === 0) {
    return NextResponse.json({ facts: null })
  }

  const facts = (kb.keyFacts as { category?: unknown; fact?: unknown }[])
    .filter((f) => typeof f.fact === 'string' && f.fact.trim().length > 0)
    .map((f) => ({
      category: typeof f.category === 'string' && f.category.trim() ? f.category : 'Overview',
      fact: f.fact as string,
    }))

  return NextResponse.json({ facts: facts.length > 0 ? facts : null })
}

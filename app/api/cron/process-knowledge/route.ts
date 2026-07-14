import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { runKnowledgeJob } from '@/lib/knowledge/runner'

// Railway calls this every minute (same cron pattern as process-calls / process-messages).
// Add to railway.toml: [[cron]] schedule = "* * * * *"
// command = "curl -X POST $APP_URL/api/cron/process-knowledge -H 'x-cron-secret: $CRON_SECRET'"
const STALE_PROCESSING_MS = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // A deploy/restart mid-crawl leaves a KB stuck in PROCESSING forever — reset anything older
  // than the stale window so it surfaces as a retryable failure instead of hanging silently.
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS)
  const staleReset = await prisma.knowledgeBase.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: staleCutoff } },
    data: { status: 'FAILED', error: 'Timed out — the server may have restarted mid-scrape. Please retry.' },
  })

  // Pick up one PENDING job whose async runner never actually started (process died right
  // after the scrape/recompile endpoint queued it). One per tick bounds load.
  const pending = await prisma.knowledgeBase.findFirst({
    where: { status: 'PENDING' },
    orderBy: { updatedAt: 'asc' },
  })

  if (pending) {
    // Fire-and-forget, same as the on-demand endpoints — this cron request must return fast,
    // not block for the full crawl+extract duration.
    void runKnowledgeJob(pending.propertyId).catch((err) => {
      console.error(`[cron/process-knowledge] runKnowledgeJob failed for property ${pending.propertyId}:`, err)
    })
  }

  return NextResponse.json({ staleReset: staleReset.count, picked: pending ? 1 : 0 })
}

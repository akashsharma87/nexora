import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { initiateAiCall } from '@/lib/ai-calling'

// Manual catch-up trigger for leads the automated 5-min-after-creation call never
// reached (the cron that's supposed to drive that path isn't reliably running yet —
// see PROGRESS_LOG). Filters by lead age and "never been called" so it won't re-dial
// leads that already got a qualification call.
const MAX_BATCH = 50
const STAGGER_MS = 90 * 1000 // 90s between dials — avoids many concurrent Twilio/OpenAI Realtime connections at once

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const minDaysOld = Number(body.minDaysOld)
  if (!Number.isFinite(minDaysOld) || minDaysOld < 0) {
    return NextResponse.json({ error: 'minDaysOld must be a non-negative number' }, { status: 400 })
  }

  const cutoff = new Date(Date.now() - minDaysOld * 24 * 60 * 60 * 1000)

  const matched = await prisma.lead.findMany({
    where: {
      propertyId: session.user.propertyId,
      stage: { notIn: ['BOOKED', 'LOST'] },
      createdAt: { lte: cutoff },
      aiCalls: { none: {} },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: MAX_BATCH + 1,
  })

  const overCap = matched.length > MAX_BATCH
  const toQueue = matched.slice(0, MAX_BATCH)

  const aiCalls = await Promise.all(
    toQueue.map((lead, i) =>
      prisma.aiCall.create({
        data: {
          leadId: lead.id,
          propertyId: session.user.propertyId,
          status: 'PENDING',
          scheduledAt: new Date(Date.now() + i * STAGGER_MS),
        },
      })
    )
  )

  aiCalls.forEach((aiCall, i) => {
    setTimeout(async () => {
      try {
        await initiateAiCall(aiCall.id)
      } catch (err) {
        console.error(`[ai-calls/bulk-trigger] Failed to dial AiCall ${aiCall.id}:`, err)
        await prisma.aiCall
          .update({
            where: { id: aiCall.id },
            data: { status: 'FAILED', notes: err instanceof Error ? err.message : 'Unknown error' },
          })
          .catch(() => {})
      }
    }, i * STAGGER_MS)
  })

  return NextResponse.json({
    matched: matched.length,
    queued: toQueue.length,
    overCap,
    cappedAt: MAX_BATCH,
  })
}

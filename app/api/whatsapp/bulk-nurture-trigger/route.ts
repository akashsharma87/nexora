import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { createNurtureSequence } from '@/lib/automation'
import { eventTypeLabels } from '@/lib/format'

// Manual catch-up trigger for leads that never got enrolled in the WhatsApp nurture sequence
// (e.g. imported before auto-nurture was turned on, or auto-nurture is deliberately kept off).
// Mirrors app/api/ai-calls/bulk-trigger exactly: filtered by lead age and "never nurtured" so it
// won't re-enroll a lead that's already in the sequence, capped + staggered so a large match
// doesn't fire everything at once.
const MAX_BATCH = 50
const STAGGER_MS = 60 * 1000 // 60s apart — WhatsApp sends aren't as connection-sensitive as live calls, but still trickled out rather than blasted

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

  const property = await prisma.property.findUnique({ where: { id: session.user.propertyId } })
  const manager = await prisma.user.findFirst({
    where: { properties: { some: { propertyId: session.user.propertyId } }, role: { in: ['OWNER', 'MANAGER'] } },
  })

  const matched = await prisma.lead.findMany({
    where: {
      propertyId: session.user.propertyId,
      stage: { notIn: ['BOOKED', 'LOST'] },
      createdAt: { lte: cutoff },
      scheduledMessages: { none: { templateType: 'INITIAL_RESPONSE' } },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_BATCH + 1,
  })

  const overCap = matched.length > MAX_BATCH
  const toQueue = matched.slice(0, MAX_BATCH)

  await Promise.all(
    toQueue.map((lead, i) =>
      createNurtureSequence({
        leadId: lead.id,
        phone: lead.phone,
        leadName: lead.name,
        eventType: eventTypeLabels[lead.eventType] || lead.eventType,
        eventDate: lead.eventDate ? lead.eventDate.toISOString().split('T')[0] : null,
        propertyName: property?.name || 'our venue',
        managerName: manager?.name || 'our team',
        baseTime: new Date(Date.now() + i * STAGGER_MS),
      })
    )
  )

  return NextResponse.json({
    matched: matched.length,
    queued: toQueue.length,
    overCap,
    cappedAt: MAX_BATCH,
  })
}

import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

const funnelStages = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'SITE_VISIT', 'PROPOSAL_SENT', 'NEGOTIATION', 'BOOKED']

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const counts = await prisma.lead.groupBy({
    by: ['stage'],
    where: { propertyId: session.user.propertyId },
    _count: { stage: true },
  })

  const countMap = new Map(counts.map((row) => [row.stage, row._count.stage]))
  const total = await prisma.lead.count({ where: { propertyId: session.user.propertyId } })

  const funnel = funnelStages.map((stage) => {
    const count = countMap.get(stage as never) ?? 0
    return {
      stage,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }
  })

  return NextResponse.json({ funnel, total })
}

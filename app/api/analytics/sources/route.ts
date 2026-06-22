import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const sources = await prisma.lead.groupBy({
    by: ['source'],
    where: { propertyId: session.user.propertyId },
    _count: { source: true },
  })

  const campaigns = await prisma.campaign.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: { budgetAmount: 'desc' },
  })

  const proposals = await prisma.proposal.findMany({
    where: {
      lead: { propertyId: session.user.propertyId },
      amount: { not: null },
    },
    include: {
      lead: { select: { source: true, eventType: true } },
    },
  })

  const revenueBySource = proposals.reduce<Record<string, number>>((acc, proposal) => {
    const source = proposal.lead.source
    acc[source] = (acc[source] ?? 0) + Number(proposal.amount ?? 0)
    return acc
  }, {})

  const revenueByEventType = proposals.reduce<Record<string, number>>((acc, proposal) => {
    const eventType = proposal.lead.eventType
    acc[eventType] = (acc[eventType] ?? 0) + Number(proposal.amount ?? 0)
    return acc
  }, {})

  return NextResponse.json({
    sources: sources.map((row) => ({ source: row.source, count: row._count.source, revenue: revenueBySource[row.source] ?? 0 })),
    campaigns,
    revenueByEventType: Object.entries(revenueByEventType).map(([eventType, revenue]) => ({ eventType, revenue })),
  })
}

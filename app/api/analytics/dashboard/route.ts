import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [newLeads, proposalsSent, bookingsConfirmed, stageCounts, sourceCounts, recentLeads] = await Promise.all([
    prisma.lead.count({
      where: {
        propertyId: session.user.propertyId,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.proposal.count({
      where: {
        lead: { propertyId: session.user.propertyId },
        status: { in: ['SENT', 'VIEWED', 'ACCEPTED'] },
      },
    }),
    prisma.lead.count({
      where: {
        propertyId: session.user.propertyId,
        stage: 'BOOKED',
      },
    }),
    prisma.lead.groupBy({
      by: ['stage'],
      where: { propertyId: session.user.propertyId },
      _count: { stage: true },
    }),
    prisma.lead.groupBy({
      by: ['source'],
      where: { propertyId: session.user.propertyId },
      _count: { source: true },
    }),
    prisma.lead.findMany({
      where: { propertyId: session.user.propertyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    }),
  ])

  const pipelineRows = await prisma.lead.findMany({
    where: {
      propertyId: session.user.propertyId,
      stage: { notIn: ['LOST'] },
    },
    select: {
      budgetMax: true,
    },
  })

  const revenuePipelineLakhs = pipelineRows.reduce((total, lead) => total + Number(lead.budgetMax ?? 0), 0)

  return NextResponse.json({
    metrics: {
      newLeads,
      proposalsSent,
      bookingsConfirmed,
      revenuePipelineLakhs,
    },
    stageCounts: stageCounts.map((row) => ({
      stage: row.stage,
      count: row._count.stage,
    })),
    sourceCounts: sourceCounts.map((row) => ({
      source: row.source,
      count: row._count.source,
    })),
    recentLeads,
  })
}

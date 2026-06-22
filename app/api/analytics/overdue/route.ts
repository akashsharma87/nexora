import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

export async function GET(_request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const now = new Date()
  const h24ago = new Date(now.getTime() - 24 * 3600 * 1000)
  const h72ago = new Date(now.getTime() - 72 * 3600 * 1000)
  const d5ago = new Date(now.getTime() - 5 * 24 * 3600 * 1000)

  const leadSelect = {
    id: true,
    name: true,
    phone: true,
    eventType: true,
    stage: true,
    createdAt: true,
    updatedAt: true,
  }

  const [newStale, followUpStale, proposalStale] = await Promise.all([
    prisma.lead.findMany({
      where: { propertyId: session.user.propertyId, stage: 'NEW', createdAt: { lt: h24ago } },
      select: leadSelect,
      take: 8,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.lead.findMany({
      where: { propertyId: session.user.propertyId, stage: { in: ['CONTACTED', 'FOLLOW_UP'] }, updatedAt: { lt: h72ago } },
      select: leadSelect,
      take: 8,
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.lead.findMany({
      where: { propertyId: session.user.propertyId, stage: 'PROPOSAL_SENT', updatedAt: { lt: d5ago } },
      select: leadSelect,
      take: 8,
      orderBy: { updatedAt: 'asc' },
    }),
  ])

  return NextResponse.json({
    newStale,
    followUpStale,
    proposalStale,
    totalOverdue: newStale.length + followUpStale.length + proposalStale.length,
  })
}

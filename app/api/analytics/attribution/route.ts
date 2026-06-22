import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { campaignBenchmarks } from '@/lib/campaign-benchmarks'

export async function GET(_request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const campaigns = await prisma.campaign.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: { createdAt: 'desc' },
  })

  const sourceGroups = await prisma.lead.groupBy({
    by: ['source'],
    where: { propertyId: session.user.propertyId },
    _count: { id: true },
  })

  const bookedBySource = await prisma.lead.groupBy({
    by: ['source'],
    where: { propertyId: session.user.propertyId, stage: 'BOOKED' },
    _count: { id: true },
  })

  const bookedMap = Object.fromEntries(bookedBySource.map((b) => [b.source, b._count.id]))

  const attribution = campaigns.map((c) => {
    const b = campaignBenchmarks[c.type]
    const actualCpl = c.leadsGenerated > 0 ? Number(c.spentAmount) / c.leadsGenerated : null
    const spendPct = b?.monthlyBudget > 0 ? (Number(c.spentAmount) / b.monthlyBudget) * 100 : 0

    let cplStatus: 'good' | 'over' | 'under' | 'no-data' = 'no-data'
    if (actualCpl !== null && b?.cplMetaMax) {
      if (actualCpl <= b.cplMetaMax) cplStatus = 'good'
      else cplStatus = 'over'
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      platforms: c.platforms,
      leadsGenerated: c.leadsGenerated,
      bookingsCount: c.bookingsCount,
      budgetAmount: Number(c.budgetAmount),
      spentAmount: Number(c.spentAmount),
      spendPct,
      actualCpl,
      benchmarkCplMin: b?.cplMetaMin || null,
      benchmarkCplMax: b?.cplMetaMax || null,
      benchmarkConversionMin: b?.bookingConversionMin || null,
      benchmarkConversionMax: b?.bookingConversionMax || null,
      cplStatus,
    }
  })

  const sources = sourceGroups.map((s) => ({
    source: s.source,
    leads: s._count.id,
    booked: bookedMap[s.source] || 0,
    conversionRate:
      s._count.id > 0 ? Math.round(((bookedMap[s.source] || 0) / s._count.id) * 100) : 0,
  }))

  return NextResponse.json({ attribution, sources })
}

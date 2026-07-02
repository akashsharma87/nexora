import { NextResponse } from 'next/server'
import type { CampaignStatus, CampaignType } from '@prisma/client'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { normalizeEventType } from '@/lib/google-sheets'
import { getMetaCampaignInsights, listMetaCampaigns } from '@/lib/meta-ads'

// Meta's effective_status has many more values than our CampaignStatus enum
// (PENDING_REVIEW, DISAPPROVED, ADSET_PAUSED, ...) — collapse anything that
// isn't clearly active/paused/ended into DRAFT rather than guessing further.
function mapEffectiveStatus(status: string): CampaignStatus {
  const s = status.toUpperCase()
  if (s === 'ACTIVE') return 'ACTIVE'
  if (s.includes('PAUSED')) return 'PAUSED'
  if (s === 'ARCHIVED' || s === 'DELETED') return 'COMPLETED'
  return 'DRAFT'
}

export async function POST() {
  const { error, session } = await requireSession()
  if (error) return error

  const property = await prisma.property.findUnique({
    where: { id: session.user.propertyId },
    select: { metaAdAccountId: true },
  })

  if (!property?.metaAdAccountId) {
    return NextResponse.json({ error: 'No Meta ad account linked to this property yet.' }, { status: 400 })
  }

  const connection = await prisma.adPlatformConnection.findUnique({
    where: { organizationId_platform: { organizationId: session.user.organizationId, platform: 'META' } },
  })

  if (!connection || connection.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Meta master account is not connected.' }, { status: 400 })
  }

  try {
    const [campaigns, insights] = await Promise.all([
      listMetaCampaigns(connection.accessToken, property.metaAdAccountId),
      getMetaCampaignInsights(connection.accessToken, property.metaAdAccountId),
    ])

    for (const c of campaigns) {
      const insight = insights.get(c.id)
      const budgetAmount = c.dailyBudget ?? c.lifetimeBudget ?? 0
      const status = mapEffectiveStatus(c.effectiveStatus)
      const endDate = c.stopTime ? new Date(c.stopTime) : null

      await prisma.campaign.upsert({
        where: { propertyId_externalId: { propertyId: session.user.propertyId, externalId: c.id } },
        create: {
          propertyId: session.user.propertyId,
          externalId: c.id,
          name: c.name,
          // Meta campaign names don't carry our 6-type taxonomy — best-effort
          // keyword match on the name, same heuristic used for Sheet imports.
          type: normalizeEventType(c.name) as CampaignType,
          platforms: ['META'],
          budgetAmount,
          spentAmount: insight?.spend ?? 0,
          leadsGenerated: insight?.leads ?? 0,
          status,
          startDate: c.startTime ? new Date(c.startTime) : new Date(),
          endDate,
        },
        update: {
          name: c.name,
          platforms: { set: ['META'] },
          budgetAmount,
          spentAmount: insight?.spend ?? 0,
          leadsGenerated: insight?.leads ?? 0,
          status,
          endDate,
        },
      })
    }

    return NextResponse.json({ synced: campaigns.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync Meta campaigns' },
      { status: 502 }
    )
  }
}

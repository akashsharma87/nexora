import { NextResponse } from 'next/server'
import type { CampaignStatus, CampaignType } from '@prisma/client'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { normalizeEventType } from '@/lib/google-sheets'
import { ensureValidGoogleAdsToken, listGoogleAdsCampaignsWithMetrics } from '@/lib/google-ads'

// Google Ads campaign.status: UNKNOWN, ENABLED, PAUSED, REMOVED.
function mapCampaignStatus(status: string): CampaignStatus {
  const s = status.toUpperCase()
  if (s === 'ENABLED') return 'ACTIVE'
  if (s === 'PAUSED') return 'PAUSED'
  if (s === 'REMOVED') return 'COMPLETED'
  return 'DRAFT'
}

const MICROS_PER_UNIT = 1_000_000

export async function POST() {
  const { error, session } = await requireSession()
  if (error) return error

  const property = await prisma.property.findUnique({
    where: { id: session.user.propertyId },
    select: { googleAdsCustomerId: true },
  })

  if (!property?.googleAdsCustomerId) {
    return NextResponse.json({ error: 'No Google Ads account linked to this property yet.' }, { status: 400 })
  }

  const connection = await prisma.adPlatformConnection.findUnique({
    where: { organizationId_platform: { organizationId: session.user.organizationId, platform: 'GOOGLE_ADS' } },
  })

  if (!connection || connection.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Google Ads master account is not connected.' }, { status: 400 })
  }

  try {
    let accessToken = connection.accessToken
    const refreshed = await ensureValidGoogleAdsToken(connection)
    if (refreshed) {
      accessToken = refreshed.accessToken
      await prisma.adPlatformConnection.update({
        where: { id: connection.id },
        data: { accessToken: refreshed.accessToken, tokenExpiresAt: refreshed.expiresAt },
      })
    }

    const campaigns = await listGoogleAdsCampaignsWithMetrics(accessToken, property.googleAdsCustomerId)

    for (const c of campaigns) {
      const budgetAmount = c.budgetMicros ? c.budgetMicros / MICROS_PER_UNIT : 0
      const status = mapCampaignStatus(c.status)
      const endDate = c.endDate ? new Date(c.endDate) : null
      // Prefixed so a numeric-id collision with a Meta campaign can never
      // merge two unrelated campaigns on the same property.
      const externalId = `google_ads:${c.id}`

      await prisma.campaign.upsert({
        where: { propertyId_externalId: { propertyId: session.user.propertyId, externalId } },
        create: {
          propertyId: session.user.propertyId,
          externalId,
          name: c.name,
          // Google Ads has no equivalent of our 6-type taxonomy either —
          // same keyword-match heuristic used for the Meta sync.
          type: normalizeEventType(c.name) as CampaignType,
          platforms: ['GOOGLE'],
          budgetAmount,
          spentAmount: c.costMicros / MICROS_PER_UNIT,
          leadsGenerated: Math.round(c.conversions),
          status,
          startDate: c.startDate ? new Date(c.startDate) : new Date(),
          endDate,
        },
        update: {
          name: c.name,
          platforms: { set: ['GOOGLE'] },
          budgetAmount,
          spentAmount: c.costMicros / MICROS_PER_UNIT,
          leadsGenerated: Math.round(c.conversions),
          status,
          endDate,
        },
      })
    }

    return NextResponse.json({ synced: campaigns.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync Google Ads campaigns' },
      { status: 502 }
    )
  }
}

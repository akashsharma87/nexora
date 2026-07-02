import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { ensureValidGoogleAdsToken, listGoogleAdsCustomers } from '@/lib/google-ads'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const connection = await prisma.adPlatformConnection.findUnique({
    where: { organizationId_platform: { organizationId: session.user.organizationId, platform: 'GOOGLE_ADS' } },
  })

  if (!connection || connection.status !== 'ACTIVE') {
    return NextResponse.json({ connected: false, accounts: [] })
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

    const customers = await listGoogleAdsCustomers(accessToken)
    const accounts = customers.map((c) => ({ id: c.id, name: c.name, currency: c.currency }))
    return NextResponse.json({ connected: true, accounts })
  } catch (err) {
    return NextResponse.json(
      { connected: true, accounts: [], error: err instanceof Error ? err.message : 'Failed to load Google Ads accounts' },
      { status: 502 }
    )
  }
}

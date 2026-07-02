import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { listMetaAdAccounts } from '@/lib/meta-ads'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const connection = await prisma.adPlatformConnection.findUnique({
    where: { organizationId_platform: { organizationId: session.user.organizationId, platform: 'META' } },
  })

  if (!connection || connection.status !== 'ACTIVE') {
    return NextResponse.json({ connected: false, accounts: [] })
  }

  try {
    const accounts = await listMetaAdAccounts(connection.accessToken)
    return NextResponse.json({ connected: true, accounts })
  } catch (err) {
    return NextResponse.json(
      { connected: true, accounts: [], error: err instanceof Error ? err.message : 'Failed to load ad accounts' },
      { status: 502 }
    )
  }
}

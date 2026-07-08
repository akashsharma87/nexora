import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

// Distinct sheet-tab / campaign names present on this property's leads, with counts — powers
// the "All Campaigns" filter on the Leads page and the "Leads by Campaign" dashboard widget.
// Tabs vary per property (each connects its own sheets), so this is always computed live rather
// than hardcoded.
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const rows = await prisma.lead.groupBy({
    by: ['sourceTab'],
    where: { propertyId: session.user.propertyId, sourceTab: { not: null } },
    _count: { sourceTab: true },
    orderBy: { _count: { sourceTab: 'desc' } },
  })

  const tabs = rows.map((row) => ({ tab: row.sourceTab as string, count: row._count.sourceTab }))

  return NextResponse.json({ tabs })
}

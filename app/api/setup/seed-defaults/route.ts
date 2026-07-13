import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { seedPropertyDefaults } from '@/lib/seeds/property-defaults'

// POST /api/setup/seed-defaults
// Populates default WhatsApp templates, platform listings, and Internet Moguls staff seats for
// the current user's property. Campaigns are NOT seeded — those only come from a real Meta/
// Google Ads sync or a campaign a user creates explicitly (see lib/seeds/property-defaults.ts).
// Safe to call multiple times — all seed functions are idempotent (skip if records already exist).
export async function POST() {
  const { error, session } = await requireSession()
  if (error) return error

  if (!session.user.propertyId) {
    return NextResponse.json({ error: 'No property linked to your account.' }, { status: 400 })
  }

  await seedPropertyDefaults(prisma, session.user.propertyId)

  const [templates, platforms, campaigns, mogulUsers] = await Promise.all([
    prisma.messageTemplate.count({ where: { propertyId: session.user.propertyId } }),
    prisma.platformListing.count({ where: { propertyId: session.user.propertyId } }),
    prisma.campaign.count({ where: { propertyId: session.user.propertyId } }),
    prisma.user.count({ where: { staffTag: { not: null }, properties: { some: { propertyId: session.user.propertyId } } } }),
  ])

  return NextResponse.json({ success: true, seeded: { templates, platforms, campaigns, mogulUsers } })
}

import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { seedPropertyDefaults } from '@/lib/seeds/property-defaults'
import { campaignCreateSchema } from '@/lib/validations/campaign'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  let campaigns = await prisma.campaign.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: { startDate: 'desc' },
  })

  if (campaigns.length === 0 && session.user.propertyId) {
    await seedPropertyDefaults(prisma, session.user.propertyId)
    campaigns = await prisma.campaign.findMany({
      where: { propertyId: session.user.propertyId },
      orderBy: { startDate: 'desc' },
    })
  }

  return NextResponse.json({ campaigns })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = campaignCreateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const campaign = await prisma.campaign.create({
    data: {
      propertyId: session.user.propertyId,
      ...parsed.data,
      keywords: parsed.data.keywords ?? [],
    },
  })

  return NextResponse.json({ campaign }, { status: 201 })
}

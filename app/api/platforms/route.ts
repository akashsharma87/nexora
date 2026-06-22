import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { seedPropertyDefaults } from '@/lib/seeds/property-defaults'
import { platformCreateSchema } from '@/lib/validations/platform'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  let platforms = await prisma.platformListing.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: { platform: 'asc' },
  })

  if (platforms.length === 0 && session.user.propertyId) {
    await seedPropertyDefaults(prisma, session.user.propertyId)
    platforms = await prisma.platformListing.findMany({
      where: { propertyId: session.user.propertyId },
      orderBy: { platform: 'asc' },
    })
  }

  return NextResponse.json({ platforms })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = platformCreateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const platform = await prisma.platformListing.create({
    data: {
      propertyId: session.user.propertyId,
      ...parsed.data,
    },
  })

  return NextResponse.json({ platform }, { status: 201 })
}

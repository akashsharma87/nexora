import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { platformUpdateSchema } from '@/lib/validations/platform'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const platform = await prisma.platformListing.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!platform) {
    return NextResponse.json({ error: 'Platform listing not found' }, { status: 404 })
  }

  return NextResponse.json({ platform })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = platformUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const existingPlatform = await prisma.platformListing.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!existingPlatform) {
    return NextResponse.json({ error: 'Platform listing not found' }, { status: 404 })
  }

  const platform = await prisma.platformListing.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json({ platform })
}

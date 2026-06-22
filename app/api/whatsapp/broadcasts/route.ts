import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { broadcastCreateSchema } from '@/lib/validations/whatsapp'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const broadcasts = await prisma.broadcastCampaign.findMany({
    where: { propertyId: session.user.propertyId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ broadcasts })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = broadcastCreateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const broadcast = await prisma.broadcastCampaign.create({
    data: {
      propertyId: session.user.propertyId,
      ...parsed.data,
      status: parsed.data.status ?? (parsed.data.scheduledAt ? 'SCHEDULED' : 'DRAFT'),
      recipients: parsed.data.recipients ?? 0,
    },
  })

  return NextResponse.json({ broadcast }, { status: 201 })
}

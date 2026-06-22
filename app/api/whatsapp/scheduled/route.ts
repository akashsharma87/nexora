import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const status = request.nextUrl.searchParams.get('status') || 'PENDING'

  const messages = await prisma.scheduledMessage.findMany({
    where: {
      lead: { propertyId: session.user.propertyId },
      ...(status !== 'ALL' ? { status: status as any } : {}),
    },
    include: { lead: { select: { id: true, name: true, phone: true } } },
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  })

  const pendingCount = await prisma.scheduledMessage.count({
    where: { lead: { propertyId: session.user.propertyId }, status: 'PENDING' },
  })

  return NextResponse.json({ messages, pendingCount })
}

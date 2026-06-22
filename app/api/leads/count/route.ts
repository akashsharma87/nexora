import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const { searchParams } = request.nextUrl
  const stage = searchParams.get('stage')
  const eventType = searchParams.get('eventType')

  const count = await prisma.lead.count({
    where: {
      propertyId: session.user.propertyId,
      ...(stage ? { stage: stage as any } : {}),
      ...(eventType ? { eventType: eventType as any } : {}),
    },
  })

  return NextResponse.json({ count })
}

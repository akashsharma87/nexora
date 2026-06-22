import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const flows = await prisma.automationFlow.findMany({
    where: {
      OR: [{ propertyId: session.user.propertyId }, { propertyId: null }],
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ flows })
}

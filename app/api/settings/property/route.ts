import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { propertyUpdateSchema } from '@/lib/validations/settings'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const property = await prisma.property.findUnique({
    where: { id: session.user.propertyId },
    include: {
      organization: {
        select: { id: true, name: true, slug: true },
      },
    },
  })

  return NextResponse.json({ property })
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = propertyUpdateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const property = await prisma.property.update({
    where: { id: session.user.propertyId },
    data: parsed.data,
  })

  return NextResponse.json({ property })
}

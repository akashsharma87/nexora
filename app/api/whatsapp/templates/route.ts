import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { messageTemplateCreateSchema } from '@/lib/validations/whatsapp'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const templates = await prisma.messageTemplate.findMany({
    where: {
      OR: [{ propertyId: session.user.propertyId }, { propertyId: null }],
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = messageTemplateCreateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const template = await prisma.messageTemplate.create({
    data: {
      propertyId: session.user.propertyId,
      ...parsed.data,
      variables: parsed.data.variables ?? [],
    },
  })

  return NextResponse.json({ template }, { status: 201 })
}

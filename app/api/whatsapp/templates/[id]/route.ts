import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { messageTemplateUpdateSchema } from '@/lib/validations/whatsapp'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = messageTemplateUpdateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const template = await prisma.messageTemplate.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const updatedTemplate = await prisma.messageTemplate.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json({ template: updatedTemplate })
}

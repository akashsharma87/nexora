import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { sendSessionMessage } from '@/lib/whatsapp'

const whatsappSchema = z.object({
  message: z.string().min(1),
  phone: z.string().min(8),
  templateId: z.string().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = whatsappSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params

  const lead = await prisma.lead.findFirst({
    where: { id, propertyId: session.user.propertyId },
    select: { id: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  await sendSessionMessage(parsed.data.phone, parsed.data.message)

  const preview = parsed.data.message.slice(0, 80)

  const activity = await prisma.leadActivity.create({
    data: {
      leadId: id,
      userId: session.user.id,
      type: 'WHATSAPP_SENT',
      content: `WhatsApp message sent: ${preview}`,
    },
  })

  return NextResponse.json({ ok: true, activity })
}

import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))

  await prisma.webhookEvent.create({
    data: { source: 'wati', eventType: body.type || 'message', payload: body },
  })

  const waId: string = body.waId || body.whatsappNumber || ''
  const messageText: string = body.text?.body || body.message || ''
  const senderName: string = body.senderName || ''

  if (!waId || !messageText) return NextResponse.json({ received: true })

  const digits = waId.replace(/\D/g, '')
  const phoneVariants = [digits, digits.startsWith('91') ? digits.slice(2) : `91${digits}`]

  const lead = await prisma.lead.findFirst({
    where: { phone: { in: phoneVariants }, stage: { notIn: ['BOOKED', 'LOST'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      property: { select: { organizationId: true } },
    },
  })

  if (lead) {
    const systemUser = await prisma.user.findFirst({
      where: {
        organizationId: lead.property.organizationId,
        role: { in: ['OWNER', 'MANAGER'] },
      },
      select: { id: true },
    })

    if (systemUser) {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: systemUser.id,
          type: 'NOTE',
          content: `WhatsApp reply received: "${messageText.slice(0, 200)}"`,
          metadata: { inbound: true, senderName, waId },
        },
      })
    }

    // Auto-advance NEW → CONTACTED on first reply
    if (lead.stage === 'NEW') {
      await prisma.lead.update({ where: { id: lead.id }, data: { stage: 'CONTACTED' } })
    }
  }

  await prisma.webhookEvent.updateMany({
    where: { source: 'wati', processed: false, createdAt: { gte: new Date(Date.now() - 5000) } },
    data: { processed: true },
  })

  return NextResponse.json({ received: true })
}

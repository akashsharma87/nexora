import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { sendSessionMessage, sendTemplateMessage, WATI_TEMPLATES } from '@/lib/whatsapp'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const broadcast = await prisma.broadcastCampaign.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (broadcast.status === 'SENT') {
    return NextResponse.json({ error: 'Broadcast already sent' }, { status: 400 })
  }

  // Get target leads
  const leads = await prisma.lead.findMany({
    where: { propertyId: session.user.propertyId, stage: { notIn: ['LOST'] } },
    select: { id: true, name: true, phone: true },
  })

  await prisma.broadcastCampaign.update({
    where: { id },
    data: { status: 'SENDING', recipients: leads.length },
  })

  let delivered = 0
  let failed = 0

  for (const lead of leads) {
    // Personalise the message with the lead's name
    const personalised = broadcast.message.replace(/\{\{name\}\}/g, lead.name)

    // Try template first, fall back to session message
    let result = await sendTemplateMessage(
      lead.phone,
      WATI_TEMPLATES.BROADCAST,
      [
        { name: 'name', value: lead.name },
        { name: 'message', value: personalised.slice(0, 200) },
      ],
      `bc_${id.slice(0, 8)}_${lead.id.slice(0, 6)}`
    )

    if (!result.success) {
      result = await sendSessionMessage(lead.phone, personalised)
    }

    if (result.success) delivered++
    else failed++

    // Respect Wati rate limits — ~10 msg/s
    await new Promise((r) => setTimeout(r, 100))
  }

  const updated = await prisma.broadcastCampaign.update({
    where: { id },
    data: {
      status: failed === leads.length ? 'FAILED' : 'SENT',
      sentAt: new Date(),
      delivered,
    },
  })

  return NextResponse.json({ broadcast: updated, delivered, failed })
}

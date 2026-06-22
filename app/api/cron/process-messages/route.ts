import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { sendTemplateMessage, sendSessionMessage } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const messages = await prisma.scheduledMessage.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    take: 50,
    orderBy: { scheduledAt: 'asc' },
    include: { lead: { select: { id: true, name: true, stage: true, propertyId: true } } },
  })

  const results = { sent: 0, failed: 0, skipped: 0 }

  for (const msg of messages) {
    if (msg.lead.stage === 'LOST') {
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'SKIPPED', sentAt: now },
      })
      results.skipped++
      continue
    }

    const payload = msg.payload as {
      templateName: string
      parameters: { name: string; value: string }[]
      message: string
    }

    let result = await sendTemplateMessage(
      msg.phone,
      payload.templateName,
      payload.parameters,
      `nx_${msg.id.slice(0, 8)}`
    )

    // Fall back to session message if template not approved yet
    if (!result.success && payload.message) {
      result = await sendSessionMessage(msg.phone, payload.message)
    }

    if (result.success) {
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'SENT', sentAt: now },
      })

      // Get a system user to attribute the activity to
      const systemUser = await prisma.user.findFirst({
        where: {
          properties: { some: { propertyId: msg.lead.propertyId } },
          role: { in: ['OWNER', 'MANAGER'] },
        },
        select: { id: true },
      })

      if (systemUser) {
        await prisma.leadActivity.create({
          data: {
            leadId: msg.leadId,
            userId: systemUser.id,
            type: 'WHATSAPP_SENT',
            content: `Automated ${msg.templateType.replaceAll('_', ' ').toLowerCase()} message sent`,
            metadata: { templateType: msg.templateType, automated: true },
          },
        })
      }

      results.sent++
    } else {
      const maxRetries = 3
      const nextRetry = new Date(now.getTime() + 15 * 60 * 1000)
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: {
          status: msg.retryCount >= maxRetries ? 'FAILED' : 'PENDING',
          error: result.error,
          retryCount: { increment: 1 },
          scheduledAt: msg.retryCount < maxRetries ? nextRetry : msg.scheduledAt,
        },
      })
      results.failed++
    }
  }

  return NextResponse.json({ processed: messages.length, ...results })
}

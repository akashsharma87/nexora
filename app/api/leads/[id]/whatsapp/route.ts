import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { sendTemplateMessage, sendSessionMessage, WATI_TEMPLATES } from '@/lib/whatsapp'

const whatsappSchema = z.object({
  message: z.string().min(1),
  phone: z.string().min(8),
  // 'template' = use approved Wati template (for cold leads / first contact)
  // 'session'  = free-form text (only works within 24h of lead replying first)
  mode: z.enum(['template', 'session']).default('template'),
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
    include: {
      property: { select: { name: true } },
    },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  let result: { success: boolean; error?: string }

  if (parsed.data.mode === 'template') {
    // Send the approved Wati template — works for cold leads who've never messaged
    // Template variables: {{1}} = lead name, {{2}} = hotel name
    result = await sendTemplateMessage(
      parsed.data.phone,
      WATI_TEMPLATES.INITIAL_RESPONSE,
      [
        { name: '1', value: lead.name },
        { name: '2', value: lead.property?.name ?? 'our venue' },
      ],
      `nexora_lead_${id}`
    )
  } else {
    // Session message — only works after lead has replied within last 24h
    result = await sendSessionMessage(parsed.data.phone, parsed.data.message)
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'WhatsApp send failed' }, { status: 502 })
  }

  const preview = parsed.data.mode === 'template'
    ? `Template message sent (nexora_initial_response) to ${lead.name}`
    : parsed.data.message.slice(0, 80)

  const activity = await prisma.leadActivity.create({
    data: {
      leadId: id,
      userId: session.user.id,
      type: 'WHATSAPP_SENT',
      content: `WhatsApp sent: ${preview}`,
      metadata: { mode: parsed.data.mode, phone: parsed.data.phone },
    },
  })

  return NextResponse.json({ ok: true, activity })
}

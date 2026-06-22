import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { leadStageSchema } from '@/lib/validations/lead'
import { schedulePostEventSequence, cancelLeadScheduledMessages, cancelNurtureMessages } from '@/lib/automation'
import { eventTypeLabels } from '@/lib/format'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = leadStageSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const lead = await prisma.lead.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const updatedLead = await prisma.lead.update({
    where: { id },
    data: {
      stage: parsed.data.stage,
      lostReason: parsed.data.stage === 'LOST' ? parsed.data.note : lead.lostReason,
    },
  })

  const activity = await prisma.leadActivity.create({
    data: {
      leadId: id,
      userId: session.user.id,
      type: 'STAGE_CHANGE',
      content: `${lead.stage.replaceAll('_', ' ')} -> ${parsed.data.stage.replaceAll('_', ' ')}`,
      metadata: {
        from: lead.stage,
        to: parsed.data.stage,
        note: parsed.data.note,
      },
    },
  })

  // Automation side-effects
  void (async () => {
    try {
      if (parsed.data.stage === 'BOOKED') {
        const property = await prisma.property.findUnique({ where: { id: updatedLead.propertyId } })
        await schedulePostEventSequence({
          leadId: updatedLead.id,
          phone: updatedLead.phone,
          leadName: updatedLead.name,
          eventType: eventTypeLabels[updatedLead.eventType] || updatedLead.eventType,
          eventDate: updatedLead.eventDate,
          propertyName: property?.name || 'our venue',
        })
        await cancelNurtureMessages(updatedLead.id)
      }
      if (parsed.data.stage === 'LOST') {
        await cancelLeadScheduledMessages(updatedLead.id)
      }
    } catch (err) {
      console.error('[STAGE CHANGE automation error]', err)
    }
  })()

  return NextResponse.json({ lead: updatedLead, activity })
}

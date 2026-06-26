import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { calculateLeadScore, leadCreateSchema } from '@/lib/validations/lead'
import { scheduleLeadNurtureSequence, scheduleAiCall } from '@/lib/automation'
import { addWatiContact } from '@/lib/whatsapp'
import { sendEmail, newLeadEmailHtml } from '@/lib/email'
import { eventTypeLabels, sourceLabels } from '@/lib/format'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search')?.trim()
  const stage = searchParams.get('stage')
  const eventType = searchParams.get('eventType')
  const source = searchParams.get('source')

  const where: Prisma.LeadWhereInput = {
    propertyId: session.user.propertyId,
    ...(stage && stage !== 'ALL' ? { stage: stage as Prisma.EnumLeadStageFilter['equals'] } : {}),
    ...(eventType && eventType !== 'ALL' ? { eventType: eventType as Prisma.EnumEventTypeFilter['equals'] } : {}),
    ...(source && source !== 'ALL' ? { source: source as Prisma.EnumLeadSourceFilter['equals'] } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { activities: true, proposals: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ leads })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = leadCreateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const leadScore =
    parsed.data.leadScore ??
    calculateLeadScore({
      budgetMax: parsed.data.budgetMax,
      guestCount: parsed.data.guestCount,
      source: parsed.data.source,
      eventDate: parsed.data.eventDate,
    })

  const lead = await prisma.lead.create({
    data: {
      propertyId: session.user.propertyId,
      ...parsed.data,
      leadScore,
      activities: {
        create: {
          userId: session.user.id,
          type: 'LEAD_CREATED',
          content: `Lead created from ${parsed.data.source.replaceAll('_', ' ')}.`,
        },
      },
    },
    include: {
      activities: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  // Fire-and-forget: automation + notifications (don't block response)
  void (async () => {
    try {
      const property = await prisma.property.findUnique({ where: { id: lead.propertyId } })
      const manager = lead.assignedToId
        ? await prisma.user.findUnique({ where: { id: lead.assignedToId } })
        : await prisma.user.findFirst({
            where: { organizationId: session.user.organizationId, role: { in: ['OWNER', 'MANAGER'] } },
          })

      await addWatiContact(lead.phone, lead.name, [
        { name: 'property', value: property?.name || '' },
        { name: 'event_type', value: lead.eventType },
      ])

      await scheduleLeadNurtureSequence({
        leadId: lead.id,
        phone: lead.phone,
        leadName: lead.name,
        eventType: eventTypeLabels[lead.eventType] || lead.eventType,
        eventDate: lead.eventDate ? lead.eventDate.toISOString().split('T')[0] : null,
        propertyName: property?.name || 'our venue',
        managerName: manager?.name || 'our team',
      })

      // Schedule AI qualification call (5 min after lead creation)
      await scheduleAiCall({ leadId: lead.id, propertyId: lead.propertyId })

      if (manager?.email) {
        await sendEmail({
          to: manager.email,
          subject: `🎯 New Lead: ${lead.name} — ${eventTypeLabels[lead.eventType] || lead.eventType}`,
          html: newLeadEmailHtml(
            manager.name,
            lead.name,
            lead.phone,
            eventTypeLabels[lead.eventType] || lead.eventType,
            sourceLabels[lead.source] || lead.source
          ),
        })
      }
    } catch (err) {
      console.error('[LEAD POST automation error]', err)
    }
  })()

  return NextResponse.json({ lead }, { status: 201 })
}

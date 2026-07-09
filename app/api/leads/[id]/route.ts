import { NextRequest, NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { calculateLeadScore, leadUpdateSchema } from '@/lib/validations/lead'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const lead = await prisma.lead.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
    include: {
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      campaign: {
        select: { id: true, name: true, type: true },
      },
      activities: {
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      proposals: {
        orderBy: { createdAt: 'desc' },
      },
      tasks: {
        orderBy: { dueDate: 'asc' },
        include: { assignedTo: { select: { id: true, name: true, staffTag: true } } },
      },
    },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const campaign = lead.campaignId
    ? await prisma.campaign.findUnique({ where: { id: lead.campaignId }, select: { id: true, name: true, type: true } })
    : null

  return NextResponse.json({ lead: { ...lead, campaign } })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = leadUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const existingLead = await prisma.lead.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
  })

  if (!existingLead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const leadScore =
    parsed.data.leadScore ??
    calculateLeadScore({
      budgetMax: Number(parsed.data.budgetMax ?? existingLead.budgetMax ?? 0),
      guestCount: parsed.data.guestCount ?? existingLead.guestCount,
      source: parsed.data.source ?? existingLead.source,
      eventDate: parsed.data.eventDate ?? existingLead.eventDate,
    })

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...parsed.data,
      leadScore,
    },
  })

  return NextResponse.json({ lead })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  await prisma.lead.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

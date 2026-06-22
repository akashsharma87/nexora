import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { leadActivityCreateSchema } from '@/lib/validations/lead'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const lead = await prisma.lead.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
    select: { id: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const activities = await prisma.leadActivity.findMany({
    where: { leadId: id },
    include: {
      user: {
        select: { id: true, name: true, role: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ activities })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = leadActivityCreateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const lead = await prisma.lead.findFirst({
    where: {
      id,
      propertyId: session.user.propertyId,
    },
    select: { id: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const activity = await prisma.leadActivity.create({
    data: {
      leadId: id,
      userId: session.user.id,
      type: 'NOTE',
      content: parsed.data.content,
    },
  })

  return NextResponse.json({ activity }, { status: 201 })
}

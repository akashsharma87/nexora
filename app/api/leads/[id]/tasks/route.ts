import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

const taskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params

  const lead = await prisma.lead.findFirst({
    where: { id, propertyId: session.user.propertyId },
    select: { id: true },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const tasks = await prisma.task.findMany({
    where: { leadId: id },
    orderBy: { dueDate: 'asc' },
  })

  return NextResponse.json({ tasks })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = taskCreateSchema.safeParse(body)

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

  const task = await prisma.task.create({
    data: {
      leadId: id,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate,
      priority: parsed.data.priority ?? 'MEDIUM',
    },
  })

  await prisma.leadActivity.create({
    data: {
      leadId: id,
      userId: session.user.id,
      type: 'TASK_CREATED',
      content: `Task created: ${parsed.data.title}`,
    },
  })

  return NextResponse.json({ task }, { status: 201 })
}

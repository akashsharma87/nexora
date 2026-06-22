import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

const taskUpdateSchema = z.object({
  completed: z.boolean().optional(),
  title: z.string().min(1).optional(),
  dueDate: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional()),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = taskUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params

  const existing = await prisma.task.findFirst({
    where: { id },
    include: { lead: { select: { propertyId: true } } },
  })

  if (!existing || existing.lead?.propertyId !== session.user.propertyId) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = { ...parsed.data }

  if (parsed.data.completed === true && !existing.completedAt) {
    data.completedAt = new Date()
  }

  const task = await prisma.task.update({
    where: { id },
    data,
  })

  if (parsed.data.completed === true && existing.leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: existing.leadId,
        userId: session.user.id,
        type: 'TASK_COMPLETED',
        content: `Task completed: ${existing.title}`,
      },
    })
  }

  return NextResponse.json({ task })
}

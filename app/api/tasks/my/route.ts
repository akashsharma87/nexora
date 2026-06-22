import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

// GET /api/tasks/my — returns open tasks assigned to the current user
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: session.user.id,
      completed: false,
    },
    orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
    include: {
      lead: {
        select: { id: true, name: true, stage: true },
      },
    },
    take: 20,
  })

  const overdueCount = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date()
  ).length

  return NextResponse.json({ tasks, overdueCount })
}

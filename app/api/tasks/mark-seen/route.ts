import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

// POST /api/tasks/mark-seen — clears the "assigned by Priya" notification by
// marking all of the caller's currently-unseen AI_CALL tasks as seen.
export async function POST() {
  const { error, session } = await requireSession()
  if (error) return error

  await prisma.task.updateMany({
    where: { assignedToId: session.user.id, source: 'AI_CALL', seenAt: null },
    data: { seenAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}

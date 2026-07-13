import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

// GET/PATCH /api/settings/profile — the CALLER's own account, not gated by
// canManage(). Lets an auto-provisioned mogul-1/2/3 seat rename themselves
// (their staffTag handle never changes) without needing OWNER/MANAGER rights.
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, staffTag: true, phone: true },
  })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ user })
}

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const profileUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  // WhatsApp number tasks get assigned-task notifications on — see notifyTaskAssigned in
  // lib/automation.ts, which silently skips anyone with phone left null.
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
})

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const parsed = profileUpdateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, staffTag: true, phone: true },
  })

  return NextResponse.json({ user })
}

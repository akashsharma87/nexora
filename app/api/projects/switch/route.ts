import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { requireSession, setActiveProjectCookie } from '@/lib/access'
import { prisma } from '@/lib/db'
import { projectSwitchSchema } from '@/lib/validations/settings'

// POST /api/projects/switch — change which project is active for the caller.
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const parsed = projectSwitchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { propertyId } = parsed.data

  // Only allow switching to a project the caller is actually a member of —
  // never trust the client to have honestly requested one it belongs to.
  const membership = await prisma.userProperty.findUnique({
    where: { userId_propertyId: { userId: session.user.id, propertyId } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'You do not have access to that project.' }, { status: 403 })
  }

  setActiveProjectCookie(await cookies(), propertyId)

  return NextResponse.json({ ok: true, activeId: propertyId })
}

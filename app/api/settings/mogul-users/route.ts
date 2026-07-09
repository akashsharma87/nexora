import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { decryptCredential, encryptCredential, generateReadablePassword } from '@/lib/credential-crypto'

// GET /api/settings/mogul-users — the active project's 3 auto-provisioned
// Internet Moguls staff seats, with their credentials decrypted for display.
// OWNER/MANAGER only — these are shared login credentials for the agency team.
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const moguls = await prisma.user.findMany({
    where: { staffTag: { not: null }, properties: { some: { propertyId: session.user.propertyId } } },
    select: { id: true, name: true, email: true, staffTag: true, tempCredential: true, isActive: true },
    orderBy: { staffTag: 'asc' },
  })

  const users = moguls.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    staffTag: m.staffTag,
    isActive: m.isActive,
    password: m.tempCredential ? decryptCredential(m.tempCredential) : null,
  }))

  return NextResponse.json({ users })
}

// POST /api/settings/mogul-users — regenerate one mogul seat's password
// (e.g. after sharing it and wanting a fresh one, or a suspected leak).
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const userId = typeof body?.userId === 'string' ? body.userId : null
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const target = await prisma.user.findFirst({
    where: {
      id: userId,
      staffTag: { not: null },
      properties: { some: { propertyId: session.user.propertyId } },
    },
  })
  if (!target) {
    return NextResponse.json({ error: 'Mogul account not found on this project' }, { status: 404 })
  }

  const plainPassword = generateReadablePassword()
  const hashedPassword = await bcrypt.hash(plainPassword, 12)

  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      tempCredential: encryptCredential(plainPassword),
    },
  })

  return NextResponse.json({ password: plainPassword })
}

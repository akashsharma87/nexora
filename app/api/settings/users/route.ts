import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

import { canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { userCreateSchema, userUpdateSchema } from '@/lib/validations/settings'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const users = await prisma.user.findMany({
    // Auto-provisioned mogul-1/2/3 seats have their own dedicated management
    // UI/API (/api/settings/mogul-users) since they need credential reveal —
    // excluded here so they don't show up twice.
    where: { organizationId: session.user.organizationId, staffTag: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ users })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = userCreateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const password = await bcrypt.hash(parsed.data.password, 12)
  const user = await prisma.user.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      password,
      role: parsed.data.role,
      phone: parsed.data.phone,
      properties: {
        create: {
          propertyId: session.user.propertyId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
    },
  })

  return NextResponse.json({ user }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = userUpdateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      id: parsed.data.id,
      organizationId: session.user.organizationId,
    },
  })

  if (!existingUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { id, ...data } = parsed.data
  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isActive: true,
    },
  })

  return NextResponse.json({ user })
}

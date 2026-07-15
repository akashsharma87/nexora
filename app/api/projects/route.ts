import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { canManage, requireSession, setActiveProjectCookie } from '@/lib/access'
import { prisma } from '@/lib/db'
import { seedPropertyDefaults } from '@/lib/seeds/property-defaults'
import { projectCreateSchema } from '@/lib/validations/settings'

// GET /api/projects — every project the user belongs to, plus which one is active
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const memberships = await prisma.userProperty.findMany({
    where: { userId: session.user.id },
    include: {
      property: {
        include: { organization: { select: { name: true } } },
      },
    },
    orderBy: { property: { name: 'asc' } },
  })

  const projects = memberships.map(({ property }) => ({
    id: property.id,
    name: property.name,
    city: property.city,
    country: property.country,
    currency: property.currency,
    organizationName: property.organization.name,
  }))

  // requireSession has already resolved the active project into session.user.propertyId
  return NextResponse.json({ projects, activeId: session.user.propertyId })
}

// POST /api/projects — create a new project in the caller's organization, link
// the caller to it, seed its defaults, and make it the active project.
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Only owners and managers can add projects.' }, { status: 403 })
  }

  const parsed = projectCreateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const project = await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        ...parsed.data,
        organizationId: session.user.organizationId,
      },
    })

    await tx.userProperty.create({
      data: { userId: session.user.id, propertyId: property.id },
    })

    return property
  })

  // Seed default templates/platforms/campaigns so the new project isn't empty
  // the moment it becomes active. Awaited on purpose — the response should
  // reflect a fully-provisioned project.
  await seedPropertyDefaults(prisma, project.id).catch((err) => {
    console.error('[projects POST] defaults seed failed:', err)
  })

  setActiveProjectCookie(await cookies(), project.id)

  return NextResponse.json({ project: { id: project.id, name: project.name } }, { status: 201 })
}

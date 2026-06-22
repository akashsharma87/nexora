import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { seedPropertyDefaults } from '@/lib/seeds/property-defaults'

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  hotelName: z.string().min(2),
})

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 })
    }

    const { name, email, password, hotelName } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }

    const baseSlug = slugify(hotelName)
    let slug = baseSlug
    let suffix = 1
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: hotelName, slug },
      })

      const property = await tx.property.create({
        data: { name: hotelName, organizationId: org.id },
      })

      const user = await tx.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          role: 'OWNER',
          organizationId: org.id,
          properties: {
            create: { propertyId: property.id },
          },
        },
      })

      return { user, org, property }
    })

    // Seed templates, platforms, and campaigns in the background — don't block the response
    seedPropertyDefaults(prisma, result.property.id).catch((err) =>
      console.error('[register] defaults seed failed:', err)
    )

    return NextResponse.json({ success: true, email: result.user.email }, { status: 201 })
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { calculateLeadScore, leadCreateSchema } from '@/lib/validations/lead'

const importSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(200),
})

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const parsed = importSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const errors: string[] = []
  let created = 0

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const row = parsed.data.rows[i]
    const validation = leadCreateSchema.safeParse(row)

    if (!validation.success) {
      errors.push(`Row ${i + 1}: ${JSON.stringify(validation.error.flatten().fieldErrors)}`)
      continue
    }

    const data = validation.data
    const leadScore = calculateLeadScore({
      budgetMax: data.budgetMax ?? null,
      guestCount: data.guestCount ?? null,
      source: data.source,
      eventDate: data.eventDate ?? null,
    })

    try {
      const lead = await prisma.lead.create({
        data: {
          propertyId: session.user.propertyId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          eventType: data.eventType,
          eventDate: data.eventDate,
          guestCount: data.guestCount,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          source: data.source,
          stage: data.stage ?? 'NEW',
          leadScore,
          notes: data.notes,
          activities: {
            create: {
              userId: session.user.id,
              type: 'LEAD_CREATED',
              content: `Lead imported from CSV`,
            },
          },
        },
      })

      if (lead) created++
    } catch {
      errors.push(`Row ${i + 1}: Database error — duplicate or constraint violation`)
    }
  }

  return NextResponse.json({ created, errors })
}

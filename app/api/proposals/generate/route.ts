import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { generateProposalContent } from '@/lib/openai'
import { eventTypeLabels, formatDate } from '@/lib/format'

export async function POST(request: NextRequest) {
  const { error } = await requireSession()
  if (error) return error

  const { leadId } = await request.json()

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { property: true },
  })

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const budgetRange =
    lead.budgetMin && lead.budgetMax
      ? `₹${lead.budgetMin}L – ₹${lead.budgetMax}L`
      : lead.budgetMax
        ? `Up to ₹${lead.budgetMax}L`
        : 'To be discussed'

  const content = await generateProposalContent({
    leadName: lead.name,
    eventType: eventTypeLabels[lead.eventType] || lead.eventType,
    guestCount: lead.guestCount || 100,
    eventDate: lead.eventDate ? formatDate(lead.eventDate) : 'TBD',
    budgetRange,
    propertyName: lead.property.name,
    notes: lead.notes || undefined,
  })

  return NextResponse.json({ content })
}

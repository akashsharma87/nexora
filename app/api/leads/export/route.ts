import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { eventTypeLabels, leadStageLabels, sourceLabels, formatDate } from '@/lib/format'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const searchParams = request.nextUrl.searchParams
  const stage = searchParams.get('stage')
  const eventType = searchParams.get('eventType')
  const source = searchParams.get('source')
  const search = searchParams.get('search')?.trim()

  const where: Prisma.LeadWhereInput = {
    propertyId: session.user.propertyId,
    ...(stage && stage !== 'ALL' ? { stage: stage as any } : {}),
    ...(eventType && eventType !== 'ALL' ? { eventType: eventType as any } : {}),
    ...(source && source !== 'ALL' ? { source: source as any } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const leads = await prisma.lead.findMany({
    where,
    include: { assignedTo: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'Name', 'Phone', 'Email', 'Event Type', 'Event Date',
    'Guest Count', 'Budget Min (L)', 'Budget Max (L)',
    'Source', 'Stage', 'Lead Score', 'Assigned To', 'Notes', 'Created At',
  ]

  const rows = leads.map((l) => [
    l.name,
    l.phone,
    l.email || '',
    eventTypeLabels[l.eventType] || l.eventType,
    l.eventDate ? formatDate(l.eventDate) : '',
    l.guestCount || '',
    l.budgetMin ? l.budgetMin.toString() : '',
    l.budgetMax ? l.budgetMax.toString() : '',
    sourceLabels[l.source] || l.source,
    leadStageLabels[l.stage] || l.stage,
    l.leadScore,
    l.assignedTo?.name || '',
    (l.notes || '').replace(/"/g, '""'),
    formatDate(l.createdAt),
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}

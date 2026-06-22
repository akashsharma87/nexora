import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

function toDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [leads, proposals, bookedLeads] = await Promise.all([
    prisma.lead.findMany({
      where: { propertyId: session.user.propertyId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.proposal.findMany({
      where: { lead: { propertyId: session.user.propertyId }, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.lead.findMany({
      where: { propertyId: session.user.propertyId, stage: 'BOOKED', updatedAt: { gte: thirtyDaysAgo } },
      select: { updatedAt: true },
    }),
  ])

  // Build a map for each of the last 30 days
  const days: { date: string; leads: number; proposals: number; bookings: number }[] = []

  for (let i = 29; i >= 0; i--) {
    const day = new Date()
    day.setDate(day.getDate() - i)
    day.setHours(0, 0, 0, 0)
    const nextDay = new Date(day)
    nextDay.setDate(nextDay.getDate() + 1)

    const label = toDateLabel(day)
    const leadsOnDay = leads.filter((l) => l.createdAt >= day && l.createdAt < nextDay).length
    const proposalsOnDay = proposals.filter((p) => p.createdAt >= day && p.createdAt < nextDay).length
    const bookingsOnDay = bookedLeads.filter((b) => b.updatedAt >= day && b.updatedAt < nextDay).length

    // Only include days with activity or every 5th day for readability
    if (leadsOnDay > 0 || proposalsOnDay > 0 || bookingsOnDay > 0 || i % 5 === 0) {
      days.push({ date: label, leads: leadsOnDay, proposals: proposalsOnDay, bookings: bookingsOnDay })
    }
  }

  return NextResponse.json({ trend: days })
}

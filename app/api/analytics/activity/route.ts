import { NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

// Real operational activity for this property — what Nexora has actually done, not campaign
// spend. Distinct from /api/analytics/dashboard (lead funnel) and /attribution (ad ROI).
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const propertyId = session.user.propertyId

  const [
    callsPlaced,
    callsByStatus,
    callsByOutcome,
    nurtureSentByType,
    postCallWhatsappSent,
    pipelineLeads,
    bookedProposals,
  ] = await Promise.all([
    prisma.aiCall.count({ where: { propertyId, status: { notIn: ['PENDING', 'CANCELLED'] } } }),
    prisma.aiCall.groupBy({ by: ['status'], where: { propertyId }, _count: { status: true } }),
    prisma.aiCall.groupBy({ by: ['outcome'], where: { propertyId, status: 'COMPLETED' }, _count: { outcome: true } }),
    prisma.scheduledMessage.groupBy({
      by: ['templateType'],
      where: { status: 'SENT', lead: { propertyId } },
      _count: { templateType: true },
    }),
    // notifyTaskAssigned (lib/automation.ts) fires WhatsApp for internal task-assignment pings
    // but doesn't log a LeadActivity row (it's a staff notification, not a lead-facing touch) —
    // there is no persisted record to count those sends from, so this only covers the post-call
    // automated message, which does log one.
    prisma.leadActivity.count({
      where: {
        type: 'WHATSAPP_SENT',
        lead: { propertyId },
        metadata: { path: ['templateType'], equals: 'POST_CALL' },
      },
    }),
    prisma.lead.findMany({
      where: { propertyId, stage: { notIn: ['LOST', 'BOOKED'] } },
      select: { budgetMax: true },
    }),
    prisma.proposal.findMany({
      where: { lead: { propertyId }, status: 'ACCEPTED', amount: { not: null } },
      select: { amount: true },
    }),
  ])

  const pipelineValue = pipelineLeads.reduce((sum, l) => sum + Number(l.budgetMax ?? 0), 0)
  const bookedRevenue = bookedProposals.reduce((sum, p) => sum + Number(p.amount ?? 0), 0)

  return NextResponse.json({
    calls: {
      placed: callsPlaced,
      byStatus: callsByStatus.map((row) => ({ status: row.status, count: row._count.status })),
      byOutcome: callsByOutcome
        .filter((row) => row.outcome !== null)
        .map((row) => ({ outcome: row.outcome as string, count: row._count.outcome })),
    },
    whatsapp: {
      nurtureSent: nurtureSentByType.map((row) => ({ templateType: row.templateType, count: row._count.templateType })),
      postCallSent: postCallWhatsappSent,
    },
    revenue: {
      pipelineValue,
      bookedRevenue,
    },
  })
}

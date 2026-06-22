import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { sendEmail, proposalEmailHtml } from '@/lib/email'
import { eventTypeLabels } from '@/lib/format'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const proposal = await prisma.proposal.findFirst({
    where: { id, lead: { propertyId: session.user.propertyId } },
    include: { lead: { include: { property: true } } },
  })

  if (!proposal) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  if (!proposal.lead.email) return NextResponse.json({ error: 'Lead has no email address' }, { status: 400 })

  const eventTypeLabel = eventTypeLabels[proposal.lead.eventType] ?? proposal.lead.eventType
  const html = proposalEmailHtml(
    proposal.lead.name,
    eventTypeLabel,
    proposal.lead.property.name,
    proposal.title
  )

  const sent = await sendEmail({
    to: proposal.lead.email,
    subject: `Your ${eventTypeLabel} Proposal — ${proposal.lead.property.name}`,
    html,
  })

  if (!sent) return NextResponse.json({ error: 'Email could not be sent' }, { status: 500 })

  await prisma.proposal.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date() },
  })

  await prisma.leadActivity.create({
    data: {
      leadId: proposal.leadId,
      userId: session.user.id,
      type: 'PROPOSAL_SENT',
      content: `Proposal "${proposal.title}" sent via email to ${proposal.lead.email}`,
    },
  })

  return NextResponse.json({ ok: true })
}

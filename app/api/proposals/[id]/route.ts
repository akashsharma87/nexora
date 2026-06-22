import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { proposalUpdateSchema } from '@/lib/validations/proposal'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const proposal = await prisma.proposal.findFirst({
    where: {
      id,
      lead: { propertyId: session.user.propertyId },
    },
    include: {
      lead: {
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  })

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  return NextResponse.json({ proposal })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const parsed = proposalUpdateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id } = await params
  const existingProposal = await prisma.proposal.findFirst({
    where: {
      id,
      lead: { propertyId: session.user.propertyId },
    },
    include: { lead: true },
  })

  if (!existingProposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  const statusTimestamps =
    parsed.data.status === 'SENT'
      ? { sentAt: new Date() }
      : parsed.data.status === 'VIEWED'
        ? { viewedAt: new Date() }
        : parsed.data.status === 'ACCEPTED'
          ? { acceptedAt: new Date() }
          : parsed.data.status === 'DECLINED'
            ? { declinedAt: new Date() }
            : {}

  const proposal = await prisma.proposal.update({
    where: { id },
    data: {
      ...parsed.data,
      ...statusTimestamps,
    },
  })

  if (parsed.data.status && parsed.data.status !== existingProposal.status) {
    await prisma.leadActivity.create({
      data: {
        leadId: existingProposal.leadId,
        userId: session.user.id,
        type: 'PROPOSAL_SENT',
        content: `Proposal status changed: ${existingProposal.status} -> ${parsed.data.status}`,
        metadata: { from: existingProposal.status, to: parsed.data.status },
      },
    })
  }

  return NextResponse.json({ proposal })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const proposal = await prisma.proposal.findFirst({
    where: {
      id,
      lead: { propertyId: session.user.propertyId },
    },
  })

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  await prisma.proposal.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

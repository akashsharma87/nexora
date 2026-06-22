import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { proposalCreateSchema } from '@/lib/validations/proposal'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const status = request.nextUrl.searchParams.get('status')

  const proposals = await prisma.proposal.findMany({
    where: {
      lead: {
        propertyId: session.user.propertyId,
      },
      ...(status && status !== 'ALL' ? { status: status as never } : {}),
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          eventType: true,
          stage: true,
          source: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ proposals })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const parsed = proposalCreateSchema.safeParse(await request.json())

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      propertyId: session.user.propertyId,
    },
  })

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  const proposal = await prisma.proposal.create({
    data: parsed.data,
    include: {
      lead: {
        select: { id: true, name: true, eventType: true, stage: true },
      },
    },
  })

  if (parsed.data.status === 'SENT') {
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: session.user.id,
        type: 'PROPOSAL_SENT',
        content: `Proposal sent: ${proposal.title}`,
      },
    })
  }

  return NextResponse.json({ proposal }, { status: 201 })
}

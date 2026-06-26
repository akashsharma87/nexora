import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { scheduleAiCall, initiateAiCall } from '@/lib/ai-calling'

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)

  const calls = await prisma.aiCall.findMany({
    where: {
      propertyId: session.user.propertyId,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      lead: { select: { id: true, name: true, phone: true, eventType: true, stage: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const stats = await prisma.aiCall.groupBy({
    by: ['status'],
    where: { propertyId: session.user.propertyId },
    _count: true,
  })

  const outcomeStats = await prisma.aiCall.groupBy({
    by: ['outcome'],
    where: { propertyId: session.user.propertyId, outcome: { not: null } },
    _count: true,
  })

  return NextResponse.json({ calls, stats, outcomeStats })
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const body = await request.json()
  const { leadId, immediate } = body as { leadId: string; immediate?: boolean }

  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, propertyId: session.user.propertyId },
  })
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  if (immediate) {
    // Create and dial immediately
    const aiCall = await prisma.aiCall.create({
      data: {
        leadId,
        propertyId: session.user.propertyId,
        status: 'PENDING',
        scheduledAt: new Date(),
      },
    })
    try {
      const sid = await initiateAiCall(aiCall.id)
      return NextResponse.json({ aiCallId: aiCall.id, callSid: sid }, { status: 201 })
    } catch (err) {
      await prisma.aiCall.update({ where: { id: aiCall.id }, data: { status: 'FAILED' } })
      console.error('[ai-calls POST]', err)
      return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 })
    }
  }

  await scheduleAiCall({ leadId, propertyId: session.user.propertyId, delayMs: 0 })
  return NextResponse.json({ scheduled: true }, { status: 201 })
}

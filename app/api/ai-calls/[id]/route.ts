import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { cancelAiCall } from '@/lib/ai-calling'
import { scheduleLeadNurtureSequence } from '@/lib/automation'
import { eventTypeLabels } from '@/lib/format'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireSession()
  if (error) return error

  const { id } = await params
  const aiCall = await prisma.aiCall.findFirst({
    where: { id, propertyId: session.user.propertyId },
    include: {
      lead: {
        select: { id: true, name: true, phone: true, eventType: true, stage: true, assignedToId: true },
      },
    },
  })

  if (!aiCall) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ aiCall })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()

  // Called by calling-server with outcome data
  const callingSecret = request.headers.get('x-calling-server-secret')
  if (callingSecret && callingSecret === process.env.CALLING_SERVER_SECRET) {
    return handleOutcomeUpdate(id, body)
  }

  // Called by UI (cancel)
  const { error, session } = await requireSession()
  if (error) return error

  const aiCall = await prisma.aiCall.findFirst({
    where: { id, propertyId: session.user.propertyId },
  })
  if (!aiCall) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.action === 'cancel') {
    await cancelAiCall(id)
    return NextResponse.json({ cancelled: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function handleOutcomeUpdate(
  aiCallId: string,
  body: {
    outcome: string
    qualifiedScore: number
    eventDate?: string
    guestCount?: number
    budgetRange?: string
    callbackTime?: string
    notes: string
    transcript: { role: string; content: string }[]
  }
) {
  const aiCall = await prisma.aiCall.findUnique({
    where: { id: aiCallId },
    include: {
      lead: {
        select: { id: true, name: true, phone: true, eventType: true, eventDate: true, stage: true, propertyId: true },
      },
    },
  })
  if (!aiCall) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Update AiCall record
  await prisma.aiCall.update({
    where: { id: aiCallId },
    data: {
      outcome: body.outcome as never,
      qualifiedScore: body.qualifiedScore,
      transcript: body.transcript,
      notes: body.notes,
      callEndedAt: new Date(),
    },
  })

  // Find a system user for activity logging
  const property = await prisma.property.findUnique({
    where: { id: aiCall.propertyId },
    select: { organizationId: true, name: true },
  })
  const systemUser = await prisma.user.findFirst({
    where: { organizationId: property?.organizationId ?? '', role: { in: ['OWNER', 'MANAGER'] } },
    select: { id: true, name: true },
  })

  if (!systemUser) return NextResponse.json({ updated: true })

  const outcomeLabel: Record<string, string> = {
    QUALIFIED: 'Qualified — interested, details gathered',
    NOT_QUALIFIED: 'Not interested',
    CALLBACK: `Wants callback${body.callbackTime ? ` — ${body.callbackTime}` : ''}`,
    WRONG_NUMBER: 'Wrong number',
    VOICEMAIL: 'Went to voicemail',
    UNKNOWN: 'Call ended — outcome unclear',
  }

  // Log activity on lead
  await prisma.leadActivity.create({
    data: {
      leadId: aiCall.leadId,
      userId: systemUser.id,
      type: 'CALL_LOGGED',
      content: `AI call completed. Outcome: ${outcomeLabel[body.outcome] ?? body.outcome}. ${body.notes}`,
      metadata: {
        aiCallId,
        outcome: body.outcome,
        qualifiedScore: body.qualifiedScore,
        duration: aiCall.duration,
        guestCount: body.guestCount ?? null,
        budgetRange: body.budgetRange ?? null,
        eventDate: body.eventDate ?? null,
      },
    },
  })

  // Post-call automation
  if (body.outcome === 'QUALIFIED' && aiCall.lead.stage === 'NEW') {
    // Advance stage to CONTACTED
    await prisma.lead.update({
      where: { id: aiCall.leadId },
      data: { stage: 'CONTACTED' },
    })

    // Create a follow-up task for the team
    await prisma.task.create({
      data: {
        leadId: aiCall.leadId,
        assignedToId: systemUser.id,
        title: `Follow up with ${aiCall.lead.name} — AI call qualified`,
        description: `Budget: ${body.budgetRange ?? 'not mentioned'}. Guests: ${body.guestCount ?? 'not mentioned'}. Notes: ${body.notes}`,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      },
    })

    // Log stage change activity
    await prisma.leadActivity.create({
      data: {
        leadId: aiCall.leadId,
        userId: systemUser.id,
        type: 'STAGE_CHANGE',
        content: 'Stage advanced to CONTACTED after AI qualification call.',
        metadata: { from: 'NEW', to: 'CONTACTED' },
      },
    })
  }

  if (body.outcome === 'CALLBACK' && body.callbackTime) {
    // Create task to call back
    await prisma.task.create({
      data: {
        leadId: aiCall.leadId,
        assignedToId: systemUser.id,
        title: `Callback required: ${aiCall.lead.name}`,
        description: `Lead requested callback at: ${body.callbackTime}`,
        priority: 'URGENT',
        dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    })
  }

  // Update lead notes with gathered info if qualified
  if (body.outcome === 'QUALIFIED') {
    const noteParts = []
    if (body.guestCount) noteParts.push(`Guests: ${body.guestCount}`)
    if (body.budgetRange) noteParts.push(`Budget: ${body.budgetRange}`)
    if (body.eventDate) noteParts.push(`Date: ${body.eventDate}`)
    if (noteParts.length > 0) {
      const existingLead = await prisma.lead.findUnique({ where: { id: aiCall.leadId }, select: { notes: true } })
      const updatedNotes = [existingLead?.notes, `[AI Call] ${noteParts.join(' | ')}`]
        .filter(Boolean)
        .join('\n')
      await prisma.lead.update({ where: { id: aiCall.leadId }, data: { notes: updatedNotes } })
    }
  }

  return NextResponse.json({ updated: true })
}

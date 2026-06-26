import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/db'

const TWILIO_STATUS_MAP: Record<string, string> = {
  initiated: 'DIALING',
  ringing: 'DIALING',
  'in-progress': 'IN_PROGRESS',
  answered: 'IN_PROGRESS',
  completed: 'COMPLETED',
  'no-answer': 'NO_ANSWER',
  busy: 'BUSY',
  failed: 'FAILED',
  canceled: 'CANCELLED',
}

export async function POST(request: NextRequest) {
  const callId = request.nextUrl.searchParams.get('callId')
  const body = await request.formData().catch(() => null)

  const twilioStatus = body?.get('CallStatus')?.toString() ?? ''
  const callSid = body?.get('CallSid')?.toString() ?? ''
  const duration = parseInt(body?.get('CallDuration')?.toString() ?? '0') || null
  const recordingUrl = body?.get('RecordingUrl')?.toString() ?? null

  console.log(`[twilio-webhook] callId=${callId} callSid=${callSid} status=${twilioStatus} duration=${duration}`)

  // Log raw webhook
  await prisma.webhookEvent.create({
    data: {
      source: 'twilio',
      eventType: twilioStatus,
      payload: { callId, callSid, twilioStatus, duration, recordingUrl },
    },
  })

  if (!callId && !callSid) return NextResponse.json({ received: true })

  const where = callId ? { id: callId } : { callSid }
  const aiCall = await prisma.aiCall.findFirst({ where })
  if (!aiCall) return NextResponse.json({ received: true })

  const newStatus = TWILIO_STATUS_MAP[twilioStatus]
  if (!newStatus) return NextResponse.json({ received: true })

  await prisma.aiCall.update({
    where: { id: aiCall.id },
    data: {
      status: newStatus as never,
      ...(duration ? { duration } : {}),
      ...(recordingUrl ? { recordingUrl } : {}),
      ...(twilioStatus === 'completed' || twilioStatus === 'no-answer' || twilioStatus === 'busy' || twilioStatus === 'failed'
        ? { callEndedAt: new Date() }
        : {}),
    },
  })

  // For terminal non-answered statuses, log activity on the lead
  const terminalNoAnswer = ['no-answer', 'busy', 'failed']
  if (terminalNoAnswer.includes(twilioStatus)) {
    const property = await prisma.property.findUnique({
      where: { id: aiCall.propertyId },
      select: { organizationId: true },
    })
    const systemUser = await prisma.user.findFirst({
      where: { organizationId: property?.organizationId ?? '', role: { in: ['OWNER', 'MANAGER'] } },
      select: { id: true },
    })
    if (systemUser) {
      const label = twilioStatus === 'no-answer' ? 'No answer' : twilioStatus === 'busy' ? 'Line busy' : 'Call failed'
      await prisma.leadActivity.create({
        data: {
          leadId: aiCall.leadId,
          userId: systemUser.id,
          type: 'CALL_LOGGED',
          content: `AI call attempt — ${label}. (Attempt ${aiCall.attempts})`,
          metadata: { aiCallId: aiCall.id, callSid, status: twilioStatus },
        },
      })

      // Retry once after 2 hours if under 3 attempts
      if (aiCall.attempts < 3) {
        await prisma.aiCall.create({
          data: {
            leadId: aiCall.leadId,
            propertyId: aiCall.propertyId,
            status: 'PENDING',
            scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          },
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}

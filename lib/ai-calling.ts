import twilio from 'twilio'

import { prisma } from '@/lib/db'

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+91${digits}`
  if (digits.startsWith('0') && digits.length === 11) return `+91${digits.slice(1)}`
  return `+${digits}`
}

export async function scheduleAiCall(params: {
  leadId: string
  propertyId: string
  delayMs?: number
}): Promise<void> {
  const { leadId, propertyId, delayMs = 5 * 60 * 1000 } = params

  // Only schedule if no pending/active call exists for this lead
  const existing = await prisma.aiCall.findFirst({
    where: { leadId, status: { in: ['PENDING', 'DIALING', 'IN_PROGRESS'] } },
  })
  if (existing) return

  await prisma.aiCall.create({
    data: {
      leadId,
      propertyId,
      status: 'PENDING',
      scheduledAt: new Date(Date.now() + delayMs),
    },
  })
}

export async function initiateAiCall(aiCallId: string): Promise<string> {
  const aiCall = await prisma.aiCall.findUniqueOrThrow({
    where: { id: aiCallId },
    include: {
      lead: {
        select: { name: true, phone: true, eventType: true, eventDate: true },
      },
    },
  })

  const property = await prisma.property.findUnique({
    where: { id: aiCall.propertyId },
    select: { name: true },
  })

  const params = new URLSearchParams({
    callId: aiCall.id,
    name: aiCall.lead.name,
    eventType: aiCall.lead.eventType,
    propertyName: property?.name ?? 'our venue',
  })
  if (aiCall.lead.eventDate) {
    params.set('eventDate', aiCall.lead.eventDate.toISOString().split('T')[0])
  }

  const appUrl = process.env.APP_URL!
  const twimlUrl = `${appUrl}/api/webhooks/twilio-twiml?${params}`
  const statusCallback = `${appUrl}/api/webhooks/twilio?callId=${aiCall.id}`

  const client = getTwilioClient()
  const call = await client.calls.create({
    to: formatPhoneE164(aiCall.lead.phone),
    from: process.env.TWILIO_PHONE_NUMBER!,
    url: twimlUrl,
    statusCallback,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    record: true,
  })

  await prisma.aiCall.update({
    where: { id: aiCallId },
    data: {
      callSid: call.sid,
      status: 'DIALING',
      callStartedAt: new Date(),
      attempts: { increment: 1 },
    },
  })

  return call.sid
}

export async function cancelAiCall(aiCallId: string): Promise<void> {
  const aiCall = await prisma.aiCall.findUnique({ where: { id: aiCallId } })
  if (!aiCall) return

  if (aiCall.callSid && aiCall.status === 'DIALING') {
    try {
      const client = getTwilioClient()
      await client.calls(aiCall.callSid).update({ status: 'canceled' })
    } catch {
      // Call may already be ended — proceed to update DB status
    }
  }

  await prisma.aiCall.update({
    where: { id: aiCallId },
    data: { status: 'CANCELLED' },
  })
}

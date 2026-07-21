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
        select: {
          name: true, phone: true, eventType: true, eventDate: true, sourceTab: true,
          guestCount: true, budgetMin: true, budgetMax: true,
        },
      },
    },
  })

  const property = await prisma.property.findUnique({
    where: { id: aiCall.propertyId },
    select: { name: true, country: true, address: true, city: true, vertical: true, currency: true },
  })

  const callingServerUrl = process.env.CALLING_SERVER_URL ?? ''
  const wsHost = callingServerUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const wsUrl = `wss://${wsHost}/stream`
  console.log(`[ai-calling] wsUrl=${wsUrl}`)

  const xmlEsc = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  // Lead context is passed via <Parameter> child elements — Twilio does not
  // reliably forward query strings on the Stream URL.
  const params: [string, string][] = [
    ['callId', aiCall.id],
    ['name', aiCall.lead.name],
    ['eventType', aiCall.lead.eventType],
    ['propertyName', property?.name ?? 'our venue'],
    // Property's country, not the lead's — this is a client-level (property) setting, since a
    // property's leads are overwhelmingly from one region. Drives Priya's default language in
    // calling-server/server.js (India → Hinglish, else → English).
    ['country', property?.country ?? 'India'],
    // Selects Priya's persona + qualification flow in buildInstructions (banquet vs apartments,
    // see VERTICAL_PROFILES in calling-server/server.js). Defaults to "banquet" so every existing
    // property with no vertical set behaves exactly as before.
    ['vertical', property?.vertical ?? 'banquet'],
    // ISO 4217 code the property's budget figures are denominated in (e.g. Kika/Kenya = "KES").
    // Used by the apartments profile to state rent in the right currency instead of INR lakhs.
    ['currency', property?.currency ?? 'INR'],
    // Lets the calling server fetch this property's Knowledge Base key facts itself (see
    // GET /api/internal/knowledge-facts) rather than trying to pass the facts through a
    // <Parameter> — there's no practical size limit concern this way, and it stays a single
    // source of truth in the DB rather than a snapshot baked into the call at dial time.
    ['propertyId', aiCall.propertyId],
  ]
  // The property's actual city/address, if staff filled it in on Settings — passed as a
  // guaranteed fact (not subject to the knowledge-base's ~20-fact cap, or to the website scrape
  // ever surfacing it at all) so Priya always knows exactly where the venue is and can correct a
  // caller who assumes the wrong city/area, instead of just agreeing to whatever they name.
  if (property?.city) params.push(['propertyCity', property.city])
  if (property?.address) params.push(['propertyAddress', property.address])
  if (aiCall.lead.eventDate) {
    params.push(['eventDate', aiCall.lead.eventDate.toISOString().split('T')[0]])
  }
  // Which sheet tab/campaign this lead came from (e.g. "Presidential Suite" vs "Kitty Party") —
  // lets the calling server distinguish a room-stay enquiry from a banquet-event enquiry and
  // personalize the opening line instead of always saying "banquet".
  if (aiCall.lead.sourceTab) {
    params.push(['sourceTab', aiCall.lead.sourceTab])
  }
  // Details already captured on the enquiry form — Priya must confirm these, not ask cold,
  // or she sounds like she never read the lead's own submission.
  if (aiCall.lead.guestCount) {
    params.push(['guestCount', String(aiCall.lead.guestCount)])
  }
  if (aiCall.lead.budgetMin) {
    params.push(['budgetMin', String(aiCall.lead.budgetMin)])
  }
  if (aiCall.lead.budgetMax) {
    params.push(['budgetMax', String(aiCall.lead.budgetMax)])
  }
  const paramXml = params
    .map(([k, v]) => `<Parameter name="${k}" value="${xmlEsc(v)}" />`)
    .join('')

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${wsUrl}">${paramXml}</Stream></Connect></Response>`

  const appUrl = process.env.APP_URL!
  const statusCallback = `${appUrl}/api/webhooks/twilio?callId=${aiCall.id}`

  const client = getTwilioClient()
  const call = await client.calls.create({
    to: formatPhoneE164(aiCall.lead.phone),
    from: process.env.TWILIO_PHONE_NUMBER!,
    twiml,
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

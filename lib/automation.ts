import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { WATI_TEMPLATES } from '@/lib/whatsapp'

// Safety ceiling shared by both auto-triggers below: a bulk sheet sync or CSV import must never
// fire more than this many real calls/WhatsApp sequences per property per rolling hour, even
// with its toggle on — a sync importing hundreds of historical leads should not blast all of
// them at once. Leads beyond the cap are still created as normal CRM records; staff can catch
// them up manually afterward (AI calling already has a purpose-built tool for this — see
// app/api/ai-calls/bulk-trigger/route.ts, itself capped + staggered).
const AUTOMATION_HOURLY_CAP = 20

async function hourlyAiCallCount(propertyId: string): Promise<number> {
  return prisma.aiCall.count({
    where: { propertyId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  })
}

async function hourlyNurtureStartCount(propertyId: string): Promise<number> {
  // One INITIAL_RESPONSE row is created per lead enrolled — counting just that template type
  // (instead of all 5 staggered rows per lead) gives "leads newly nurtured in the last hour".
  return prisma.scheduledMessage.count({
    where: {
      lead: { propertyId },
      templateType: 'INITIAL_RESPONSE',
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  })
}

export async function scheduleLeadNurtureSequence(params: {
  leadId: string
  propertyId: string
  phone: string
  leadName: string
  eventType: string
  eventDate: string | null
  propertyName: string
  managerName: string
}) {
  const { leadId, propertyId, phone, leadName, eventType, eventDate, propertyName, managerName } = params

  // Auto-scheduling on lead creation (manual add, CSV import, Google Sheets sync) is off by
  // default — a property must explicitly opt in via the toggle on /whatsapp
  // (Property.autoWhatsappNurtureEnabled). This does NOT gate a manually-sent WhatsApp message.
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { autoWhatsappNurtureEnabled: true },
  })
  if (!property?.autoWhatsappNurtureEnabled) return
  if ((await hourlyNurtureStartCount(propertyId)) >= AUTOMATION_HOURLY_CAP) return

  const now = new Date()

  // All nurture templates below (except INITIAL_RESPONSE, handled separately) are
  // approved/designed with the same 2 vars: {{1}}=name, {{2}}=hotel_name — keep the
  // params array uniform so a template's actual variable count is never a guess.
  const twoVarParams = [
    { name: '1', value: leadName },
    { name: '2', value: propertyName },
  ]

  const messages = [
    {
      templateType: 'INITIAL_RESPONSE' as const,
      // 10 minutes after lead creation (AI call will run at 5 min, WA follows after)
      scheduledAt: new Date(now.getTime() + 10 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.INITIAL_RESPONSE,
        // nexora_initial_response is approved with exactly 2 vars: {{1}}=name, {{2}}=hotel_name
        // (matches app/api/leads/[id]/whatsapp/route.ts's manual send) — do not reuse the
        // shared 3-5-param templateParams here, it doesn't match this template's variable count.
        parameters: [
          { name: '1', value: leadName },
          { name: '2', value: propertyName },
        ],
        message: `Hi ${leadName}! 🎉 Thank you for your enquiry about ${eventType} at ${propertyName}. We would love to host your special occasion! I am attaching our banquet brochure and pricing details. Our hall accommodates 50–500 guests with stunning décor options. Can we schedule a quick call or venue visit? Reply YES to confirm. — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY1' as const,
      // Day 1: venue photos + packages (image-capable template)
      scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY1,
        parameters: twoVarParams,
        message: `Hi ${leadName}! 🏛️ Here are some stunning photos of ${propertyName} and our latest ${eventType} packages. We have beautiful setups for 50–500 guests. Would you like to see more or schedule a venue tour? — ${managerName}`,
        imageUrl: null, // set a Cloudflare R2 / CDN URL per property when available
      },
    },
    {
      templateType: 'NURTURE_DAY3' as const,
      scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY3,
        parameters: twoVarParams,
        message: `Hi ${leadName}, following up on your ${eventType} enquiry 😊 We have exclusive packages available and recently hosted several beautiful events with rave reviews! Would you like to see our latest venue photos and an updated quote? — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY5' as const,
      scheduledAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY5,
        parameters: twoVarParams,
        message: `Hi ${leadName}! Sharing what our recent guests say about ${propertyName} 🌟 "Absolutely stunning venue — the team went above and beyond!" Would you like to schedule a venue tour this week? — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY7' as const,
      scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY7,
        parameters: twoVarParams,
        message: `Hi ${leadName}, last follow-up from my side! 🙏 ${eventDate ? `Your ${eventDate} date has` : 'Your preferred date may have'} limited availability — a few other enquiries are pending for the same period. Can we do a quick 10-minute call today to finalise your package? Reply CALL and I will reach out immediately. — ${managerName}`,
      },
    },
  ]

  await prisma.scheduledMessage.createMany({
    data: messages.map((m) => ({
      leadId,
      phone,
      templateType: m.templateType,
      scheduledAt: m.scheduledAt,
      payload: m.payload as unknown as Prisma.InputJsonValue,
    })),
  })
}

export async function schedulePostEventSequence(params: {
  leadId: string
  phone: string
  leadName: string
  eventType: string
  eventDate: Date | null
  propertyName: string
}) {
  const { leadId, phone, leadName, eventType, eventDate, propertyName } = params
  const base = eventDate || new Date()

  const messages = [
    {
      templateType: 'POST_EVENT_DAY3' as const,
      scheduledAt: new Date(base.getTime() + 3 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.POST_EVENT_DAY3,
        parameters: [
          { name: 'name', value: leadName },
          { name: 'event_type', value: eventType },
          { name: 'hotel_name', value: propertyName },
        ],
        message: `Hi ${leadName}! 🙏 Thank you for choosing ${propertyName} for your ${eventType}. We hope it was everything you envisioned! Could you spare 2 minutes to share your experience? Your feedback means the world to us.`,
      },
    },
    {
      templateType: 'POST_EVENT_DAY30' as const,
      scheduledAt: new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.POST_EVENT_DAY30,
        parameters: [
          { name: 'name', value: leadName },
          { name: 'hotel_name', value: propertyName },
        ],
        message: `Hi ${leadName}! Greetings from ${propertyName} 😊 Do you have friends or family planning a celebration soon? We would love to offer them our special referral discount. Know someone? Reply REFER and we will share the details!`,
      },
    },
    {
      templateType: 'POST_EVENT_DAY90' as const,
      scheduledAt: new Date(base.getTime() + 90 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.POST_EVENT_DAY90,
        parameters: [
          { name: 'name', value: leadName },
          { name: 'hotel_name', value: propertyName },
        ],
        message: `Hi ${leadName}! 🌟 Greetings from ${propertyName}! Planning your next event or celebration? We have exclusive offers for our returning guests. Reply OFFER to see our latest packages!`,
      },
    },
  ]

  await prisma.scheduledMessage.createMany({
    data: messages.map((m) => ({
      leadId,
      phone,
      templateType: m.templateType,
      scheduledAt: m.scheduledAt,
      payload: m.payload as unknown as Prisma.InputJsonValue,
    })),
  })
}

// Auto-scheduling on lead creation (manual add, CSV import, Google Sheets sync) is
// off by default — a property must explicitly opt in via the toggle on /ai-calls
// (Property.autoAiCallingEnabled). This does NOT gate the manual "Call with AI"
// button or the bulk "Start AI Calling" trigger — those are explicit user actions.
export async function scheduleAiCall(params: {
  leadId: string
  propertyId: string
  delayMs?: number
}): Promise<void> {
  const { leadId, propertyId, delayMs = 5 * 60 * 1000 } = params

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { autoAiCallingEnabled: true },
  })
  if (!property?.autoAiCallingEnabled) return
  if ((await hourlyAiCallCount(propertyId)) >= AUTOMATION_HOURLY_CAP) return

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

export async function cancelLeadScheduledMessages(leadId: string) {
  await prisma.scheduledMessage.updateMany({
    where: { leadId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
}

export async function cancelNurtureMessages(leadId: string) {
  await prisma.scheduledMessage.updateMany({
    where: {
      leadId,
      status: 'PENDING',
      templateType: { in: ['NURTURE_DAY3', 'NURTURE_DAY5', 'NURTURE_DAY7'] },
    },
    data: { status: 'CANCELLED' },
  })
}

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { WATI_TEMPLATES, buildTemplateParams } from '@/lib/whatsapp'

export async function scheduleLeadNurtureSequence(params: {
  leadId: string
  phone: string
  leadName: string
  eventType: string
  eventDate: string | null
  propertyName: string
  managerName: string
}) {
  const { leadId, phone, leadName, eventType, eventDate, propertyName, managerName } = params
  const now = new Date()

  const templateParams = buildTemplateParams({ leadName, eventType, eventDate: eventDate || undefined, propertyName, managerName })

  const messages = [
    {
      templateType: 'INITIAL_RESPONSE' as const,
      // 2 minutes after lead creation
      scheduledAt: new Date(now.getTime() + 2 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.INITIAL_RESPONSE,
        parameters: templateParams,
        message: `Hi ${leadName}! 🎉 Thank you for your enquiry about ${eventType} at ${propertyName}. We would love to host your special occasion! I am attaching our banquet brochure and pricing details. Our hall accommodates 50–500 guests with stunning décor options. Can we schedule a quick call or venue visit? Reply YES to confirm. — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY3' as const,
      scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY3,
        parameters: templateParams,
        message: `Hi ${leadName}, following up on your ${eventType} enquiry 😊 We have exclusive packages available and recently hosted several beautiful events with rave reviews! Would you like to see our latest venue photos and an updated quote? — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY5' as const,
      scheduledAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY5,
        parameters: templateParams,
        message: `Hi ${leadName}! Sharing what our recent guests say about ${propertyName} 🌟 "Absolutely stunning venue — the team went above and beyond!" Would you like to schedule a venue tour this week? — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY7' as const,
      scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY7,
        parameters: buildTemplateParams({ leadName, eventType, eventDate: eventDate || undefined, propertyName, managerName }),
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

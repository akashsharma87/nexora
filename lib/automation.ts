import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import {
  WATI_TEMPLATES,
  nurtureTrack,
  buildNurtureHook,
  sendTemplateMessage,
  sendSessionMessage,
} from '@/lib/whatsapp'
import { generateEnquiryLabel } from '@/lib/openai'

// Internal staff notification, not lead-facing — fired whenever a Task is created with an
// assignee, from both manual task creation (app/api/leads/[id]/tasks/route.ts) and Priya's
// AI-call follow-up tasks (app/api/ai-calls/[id]/route.ts). Silently no-ops if the assignee has
// no phone on file (auto-provisioned mogul-1/2/3 seats start with none — see
// lib/seeds/property-defaults.ts — until the person adds one from Settings → My Profile) so a
// missing number never blocks task creation, it just means that person gets no WhatsApp ping.
export async function notifyTaskAssigned(params: {
  assigneeId: string
  taskTitle: string
  leadName?: string | null
  dueDate?: Date | null
}): Promise<{ sent: boolean; reason?: string }> {
  const assignee = await prisma.user.findUnique({
    where: { id: params.assigneeId },
    select: { name: true, phone: true },
  })
  if (!assignee?.phone) return { sent: false, reason: 'no_phone' }

  const context = params.leadName || 'a lead'
  const dueLabel = params.dueDate
    ? params.dueDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  const parameters = [
    { name: '1', value: assignee.name },
    { name: '2', value: params.taskTitle },
    { name: '3', value: context },
  ]

  let result = await sendTemplateMessage(
    assignee.phone,
    WATI_TEMPLATES.TASK_ASSIGNED,
    parameters,
    `nx_task_${Date.now()}`
  )
  // Staff won't usually have an open 24-hr session window with the WABA number either — same
  // fallback shape as sendPostCallWhatsApp, kept for when the template isn't approved yet.
  if (!result.success) {
    result = await sendSessionMessage(
      assignee.phone,
      `Hi ${assignee.name}, a new task has been assigned to you: "${params.taskTitle}" (${context})${
        dueLabel ? ` — due ${dueLabel}` : ''
      }.`
    )
  }

  return { sent: result.success, reason: result.success ? undefined : result.error }
}

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

// The actual message-row creation, with no gating — used by the gated auto-trigger below AND
// by the manual bulk "catch-up" trigger (app/api/whatsapp/bulk-nurture-trigger), which
// deliberately bypasses the auto-toggle the same way the AI-calling bulk trigger bypasses
// autoAiCallingEnabled: it's an explicit one-time user action, not automatic background behavior.
// `baseTime` lets the bulk trigger stagger each lead's sequence a few minutes apart instead of
// scheduling everyone's INITIAL_RESPONSE for the same instant.
export async function createNurtureSequence(params: {
  leadId: string
  phone: string
  leadName: string
  eventType: string
  eventDate: string | null
  propertyName: string
  managerName: string
  sourceTab?: string | null
  // Property.vertical — selects the RENTAL track for apartments-vertical properties (Kika-style).
  // Optional and unused by any existing caller, so every current call site keeps its original
  // sourceTab-only EVENT/STAY branching untouched.
  vertical?: string | null
  baseTime?: Date
}) {
  const { leadId, phone, leadName, eventType, propertyName, managerName, sourceTab, vertical } = params
  const now = params.baseTime ?? new Date()

  // Source-aware personalisation is carried entirely in template variables so ONE 4-variable
  // template family covers every campaign tab + all tracks (see WHATSAPP_NURTURE_TEMPLATE_PLAN.md):
  //   {{3}} enquiry label — AI-generated per tab, cached, with a deterministic fallback
  //   {{4}} value hook     — deterministic per track
  // Branches identically to the AI voice call via the shared isRoomStayInquiry keyword set /
  // vertical flag.
  const track = nurtureTrack(sourceTab, vertical)
  const isRental = track === 'RENTAL'
  const hook = buildNurtureHook(track)
  const label = await generateEnquiryLabel({ sourceTab, eventType, isStay: track === 'STAY', isRental })

  // All 5 templates share the same 4 vars in the same order — {{1}}=name, {{2}}=property,
  // {{3}}=enquiry label, {{4}}=value hook — so the params array is uniform and a template's real
  // variable count is never a guess.
  const params4 = [
    { name: '1', value: leadName },
    { name: '2', value: propertyName },
    { name: '3', value: label },
    { name: '4', value: hook },
  ]

  // The `message` on each payload is the free-text session fallback the cron uses ONLY if the
  // template isn't approved yet (sent within the 24-hr window). Kept honest: it does NOT promise
  // photos/videos until a per-property media pack exists (same honesty fix as the AI voice script).
  const messages = [
    {
      templateType: 'INITIAL_RESPONSE' as const,
      // 10 minutes after lead creation (AI call will run at 5 min, WA follows after)
      scheduledAt: new Date(now.getTime() + 10 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.INITIAL_RESPONSE,
        parameters: params4,
        message: `Hi ${leadName}, thank you for your ${label} enquiry at ${propertyName}. I would be glad to help you with ${hook}. If convenient, we can arrange a quick call or visit to take this forward. — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY1' as const,
      scheduledAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY1,
        parameters: params4,
        message: `Hi ${leadName}, following up on your ${label} enquiry at ${propertyName}. I can help you with ${hook}. Would a quick call work for you today? — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY3' as const,
      scheduledAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY3,
        parameters: params4,
        message: `Hi ${leadName}, checking in on your ${label} plan at ${propertyName}. If you are comparing options, I can share ${hook}. Happy to arrange a call or visit whenever it suits you. — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY5' as const,
      scheduledAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY5,
        parameters: params4,
        // "Our recent guests" reads oddly to a rental prospect (they'd be a tenant, not a
        // hospitality guest) — the only spot in this message family that names a person-type
        // outside the label/hook variables, so it's the only line that needs a per-track variant.
        message: isRental
          ? `Hi ${leadName}, a quick update from ${propertyName} on your ${label} enquiry. Many of our tenants have really enjoyed living here. Can I help you with ${hook} this week? — ${managerName}`
          : `Hi ${leadName}, a quick update from ${propertyName} on your ${label} enquiry. Our recent guests have really enjoyed their experience with us. Can I help you with ${hook} this week? — ${managerName}`,
      },
    },
    {
      templateType: 'NURTURE_DAY7' as const,
      scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      payload: {
        templateName: WATI_TEMPLATES.NURTURE_DAY7,
        parameters: params4,
        message: `Hi ${leadName}, a final follow-up on your ${label} enquiry at ${propertyName}. If you still need ${hook}, our team would be glad to help. You can reply here anytime to connect. — ${managerName}`,
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

// Auto-scheduling on lead creation (manual add, CSV import, Google Sheets sync) is off by
// default — a property must explicitly opt in via the toggle on /whatsapp
// (Property.autoWhatsappNurtureEnabled). This does NOT gate a manually-sent WhatsApp message or
// the manual bulk catch-up trigger, which calls createNurtureSequence directly.
export async function scheduleLeadNurtureSequence(params: {
  leadId: string
  propertyId: string
  phone: string
  leadName: string
  eventType: string
  eventDate: string | null
  propertyName: string
  managerName: string
  sourceTab?: string | null
}) {
  const { propertyId, ...rest } = params

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { autoWhatsappNurtureEnabled: true, vertical: true },
  })
  if (!property?.autoWhatsappNurtureEnabled) return
  if ((await hourlyNurtureStartCount(propertyId)) >= AUTOMATION_HOURLY_CAP) return

  await createNurtureSequence({ ...rest, vertical: property.vertical })
}

// Fired immediately from the AI-call outcome handler when Priya's call reaches a successful
// conclusion (QUALIFIED / CALLBACK): sends the warm "Priya just connected with you" WhatsApp the
// caller promised, then cancels the pending cold INITIAL_RESPONSE so the lead isn't also sent the
// generic first-touch. Gated on the same autoWhatsappNurtureEnabled toggle as the rest of WhatsApp
// automation — a property with WhatsApp automation off sends nothing here either.
export async function sendPostCallWhatsApp(params: {
  leadId: string
  phone: string
  leadName: string
  eventType: string
  propertyId: string
  propertyName: string
  sourceTab?: string | null
  callerName?: string
  systemUserId?: string
}): Promise<{ sent: boolean }> {
  const property = await prisma.property.findUnique({
    where: { id: params.propertyId },
    select: { autoWhatsappNurtureEnabled: true, vertical: true },
  })
  if (!property?.autoWhatsappNurtureEnabled) {
    // This is the #1 reason a post-call WhatsApp "never sends": the toggle defaults to false,
    // so a property that never opted in on /whatsapp silently sends nothing here. Log it loudly
    // rather than returning in silence, so it's diagnosable instead of looking like a dead feature.
    console.log(`[sendPostCallWhatsApp] SKIPPED — property ${params.propertyId} has autoWhatsappNurtureEnabled=OFF (lead ${params.leadId}). Enable WhatsApp automation on the /whatsapp settings page to send post-call messages.`)
    return { sent: false }
  }

  const track = nurtureTrack(params.sourceTab, property.vertical)
  const hook = buildNurtureHook(track)
  const label = await generateEnquiryLabel({
    sourceTab: params.sourceTab,
    eventType: params.eventType,
    isStay: track === 'STAY',
    isRental: track === 'RENTAL',
  })
  const caller = params.callerName || 'Priya'

  // Same 4-var family as the nurture templates: {{1}}=name, {{2}}=property, {{3}}=label, {{4}}=hook.
  const parameters = [
    { name: '1', value: params.leadName },
    { name: '2', value: params.propertyName },
    { name: '3', value: label },
    { name: '4', value: hook },
  ]

  let result = await sendTemplateMessage(
    params.phone,
    WATI_TEMPLATES.POST_CALL,
    parameters,
    `nx_postcall_${params.leadId.slice(0, 8)}`
  )
  // A just-called lead usually has no open 24-hr WhatsApp session window (they got a phone call,
  // not a chat), so POST_CALL must be an approved template to actually deliver — the free-text
  // fallback only lands if the lead has messaged us within 24 hrs.
  if (!result.success) {
    result = await sendSessionMessage(
      params.phone,
      `Hi ${params.leadName}, ${caller} from ${params.propertyName} just connected with you about your ${label} enquiry. As promised, I can help you with ${hook} — reply here anytime and we'll take it forward.`
    )
  }

  // The warmer post-call message replaces the cold scheduled first-touch for this lead.
  await prisma.scheduledMessage.updateMany({
    where: { leadId: params.leadId, status: 'PENDING', templateType: 'INITIAL_RESPONSE' },
    data: { status: 'CANCELLED' },
  })

  if (result.success && params.systemUserId) {
    await prisma.leadActivity.create({
      data: {
        leadId: params.leadId,
        userId: params.systemUserId,
        type: 'WHATSAPP_SENT',
        content: `Post-call WhatsApp sent after ${caller}'s call`,
        metadata: { templateType: 'POST_CALL', automated: true },
      },
    })
  }

  return { sent: result.success }
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

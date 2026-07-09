import { EventType, LeadSource, LeadStage } from '@prisma/client'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const leadCreateSchema = z.object({
  name: z.string().min(2),
  email: z.preprocess(emptyToUndefined, z.string().email().optional()),
  phone: z.string().min(8),
  eventType: z.nativeEnum(EventType),
  eventDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  guestCount: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  budgetMin: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  budgetMax: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  source: z.nativeEnum(LeadSource),
  stage: z.nativeEnum(LeadStage).optional(),
  leadScore: z.coerce.number().int().min(0).max(100).optional(),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  assignedToId: z.preprocess(emptyToUndefined, z.string().optional()),
  campaignId: z.preprocess(emptyToUndefined, z.string().optional()),
  // Manually testing which sheet-tab (e.g. "Presidential Suite") the AI caller should treat
  // this lead as — normally set automatically by the Google Sheets sync, never by hand.
  sourceTab: z.preprocess(emptyToUndefined, z.string().optional()),
})

export const leadUpdateSchema = leadCreateSchema.partial()

export const leadStageSchema = z.object({
  stage: z.nativeEnum(LeadStage),
  note: z.string().optional(),
})

export const leadActivityCreateSchema = z.object({
  content: z.string().min(1),
})

export function calculateLeadScore(input: {
  budgetMax?: number | null
  guestCount?: number | null
  source?: LeadSource
  eventDate?: Date | null
}) {
  let score = 40

  if ((input.budgetMax ?? 0) >= 70) score += 20
  else if ((input.budgetMax ?? 0) >= 40) score += 12

  if ((input.guestCount ?? 0) >= 300) score += 12
  else if ((input.guestCount ?? 0) >= 180) score += 8

  if (input.source && ['WEDMEGOOD', 'REFERRAL', 'GOOGLE'].includes(input.source)) {
    score += 10
  }

  if (input.eventDate) {
    const daysUntilEvent = Math.ceil((input.eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntilEvent > 0 && daysUntilEvent <= 45) score += 12
  }

  return Math.min(100, score)
}

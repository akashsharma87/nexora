import { CampaignPlatform, CampaignStatus, CampaignType } from '@prisma/client'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const campaignCreateSchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(CampaignType),
  platforms: z.array(z.nativeEnum(CampaignPlatform)).min(1),
  budgetAmount: z.coerce.number().nonnegative(),
  spentAmount: z.coerce.number().nonnegative().optional(),
  leadsGenerated: z.coerce.number().int().nonnegative().optional(),
  bookingsCount: z.coerce.number().int().nonnegative().optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
  startDate: z.coerce.date(),
  endDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  keywords: z.array(z.string()).optional(),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
})

export const campaignUpdateSchema = campaignCreateSchema.partial()

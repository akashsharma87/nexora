import { ListingPlatform, ListingStatus } from '@prisma/client'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const platformCreateSchema = z.object({
  platform: z.nativeEnum(ListingPlatform),
  status: z.nativeEnum(ListingStatus).optional(),
  tier: z.preprocess(emptyToUndefined, z.string().optional()),
  profileUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
  leadsGenerated: z.coerce.number().int().nonnegative().optional(),
  revenueGenerated: z.coerce.number().nonnegative().optional(),
  contentScore: z.coerce.number().int().min(0).max(100).optional(),
  lastUpdatedAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  notes: z.preprocess(emptyToUndefined, z.string().optional()),
  contentChecklist: z.any().optional(),
})

export const platformUpdateSchema = platformCreateSchema.partial()

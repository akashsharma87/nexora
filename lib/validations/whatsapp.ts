import { BroadcastStatus, TemplateType } from '@prisma/client'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const messageTemplateCreateSchema = z.object({
  name: z.string().min(2),
  type: z.nativeEnum(TemplateType),
  content: z.string().min(1),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
})

export const messageTemplateUpdateSchema = messageTemplateCreateSchema.partial()

export const broadcastCreateSchema = z.object({
  name: z.string().min(2),
  templateId: z.preprocess(emptyToUndefined, z.string().optional()),
  message: z.string().min(1),
  scheduledAt: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  status: z.nativeEnum(BroadcastStatus).optional(),
  recipients: z.coerce.number().int().nonnegative().optional(),
})

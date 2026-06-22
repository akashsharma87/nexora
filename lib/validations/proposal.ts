import { ProposalStatus } from '@prisma/client'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const proposalCreateSchema = z.object({
  leadId: z.string().min(1),
  title: z.string().min(2),
  content: z.string().min(1),
  amount: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
  eventDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  guestCount: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  validUntil: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  status: z.nativeEnum(ProposalStatus).optional(),
})

export const proposalUpdateSchema = proposalCreateSchema.omit({ leadId: true }).partial()

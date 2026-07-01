import { UserRole } from '@prisma/client'
import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

export const propertyUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.preprocess(emptyToUndefined, z.string().optional()),
  city: z.preprocess(emptyToUndefined, z.string().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  email: z.preprocess(emptyToUndefined, z.string().email().optional()),
  logoUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
})

export const projectCreateSchema = z.object({
  name: z.string().min(2),
  address: z.preprocess(emptyToUndefined, z.string().optional()),
  city: z.preprocess(emptyToUndefined, z.string().optional()),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  email: z.preprocess(emptyToUndefined, z.string().email().optional()),
})

export const projectSwitchSchema = z.object({
  propertyId: z.string().min(1),
})

export const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
})

export const userUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).optional(),
  role: z.nativeEnum(UserRole).optional(),
  phone: z.preprocess(emptyToUndefined, z.string().optional()),
  isActive: z.boolean().optional(),
})

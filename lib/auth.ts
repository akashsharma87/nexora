import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { prisma } from '@/lib/db'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET ?? 'nexora-local-development-secret',
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials)

        if (!parsed.success) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
          include: {
            organization: true,
            properties: {
              include: {
                property: true,
              },
              take: 1,
            },
          },
        })

        if (!user?.isActive) {
          return null
        }

        const passwordsMatch = await bcrypt.compare(parsed.data.password, user.password)

        if (!passwordsMatch) {
          return null
        }

        const property = user.properties[0]?.property

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          propertyId: property?.id ?? '',
          propertyName: property?.name,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.organizationId = user.organizationId
        token.organizationName = user.organizationName
        token.propertyId = user.propertyId
        token.propertyName = user.propertyName
      }

      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.role = token.role
        session.user.organizationId = token.organizationId
        session.user.organizationName = token.organizationName
        session.user.propertyId = token.propertyId
        session.user.propertyName = token.propertyName
      }

      return session
    },
  },
})

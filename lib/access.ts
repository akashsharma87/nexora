import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export { canManage } from '@/lib/roles'

export const ACTIVE_PROPERTY_COOKIE = 'nexora_active_property'
const ACTIVE_PROPERTY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

type CookieStore = Awaited<ReturnType<typeof cookies>>

// Persists the active project selection. httpOnly + server-verified membership
// (see requireSession/isMember) means the client can request a switch but can
// never forge access to a project it doesn't belong to.
export function setActiveProjectCookie(cookieStore: CookieStore, propertyId: string) {
  cookieStore.set(ACTIVE_PROPERTY_COOKIE, propertyId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACTIVE_PROPERTY_COOKIE_MAX_AGE,
  })
}

function unauthorized() {
  return {
    error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    session: null,
  }
}

async function isMember(userId: string, propertyId?: string | null) {
  if (!propertyId) return false
  const membership = await prisma.userProperty.findUnique({
    where: { userId_propertyId: { userId, propertyId } },
  })
  return Boolean(membership)
}

/**
 * Resolves the caller's session AND their currently active project.
 *
 * A user can belong to multiple properties (UserProperty). The active one is
 * tracked via a cookie so it can be switched without re-authenticating. The
 * cookie value is only ever trusted after confirming membership — this is the
 * one place a stale/tampered cookie could otherwise leak another tenant's data.
 *
 * On success, session.user.propertyId is overwritten with the resolved active
 * property id, so every existing route that reads session.user.propertyId
 * automatically operates on the active project without any further changes.
 */
export async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  const userId = session.user.id
  const cookieStore = await cookies()
  const requestedPropertyId = cookieStore.get(ACTIVE_PROPERTY_COOKIE)?.value

  let activePropertyId: string | null = null

  if (requestedPropertyId && (await isMember(userId, requestedPropertyId))) {
    activePropertyId = requestedPropertyId
  }

  if (!activePropertyId && (await isMember(userId, session.user.propertyId))) {
    activePropertyId = session.user.propertyId
  }

  if (!activePropertyId) {
    const firstMembership = await prisma.userProperty.findFirst({
      where: { userId },
      orderBy: { propertyId: 'asc' },
    })
    activePropertyId = firstMembership?.propertyId ?? null
  }

  if (!activePropertyId) {
    return {
      error: NextResponse.json({ error: 'No project linked to your account.' }, { status: 401 }),
      session: null,
    }
  }

  session.user.propertyId = activePropertyId

  return {
    error: null,
    session,
  }
}

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'

export async function requireSession() {
  const session = await auth()

  if (!session?.user?.propertyId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    }
  }

  return {
    error: null,
    session,
  }
}

export function canManage(role?: string) {
  return role === 'OWNER' || role === 'MANAGER'
}

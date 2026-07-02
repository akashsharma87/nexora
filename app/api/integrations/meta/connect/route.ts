import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { getMetaAuthUrl } from '@/lib/meta-ads'

export const META_OAUTH_STATE_COOKIE = 'nexora_meta_oauth_state'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set(META_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  return NextResponse.redirect(getMetaAuthUrl(state))
}

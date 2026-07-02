import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { canManage, requireSession } from '@/lib/access'
import { getGoogleAdsAuthUrl } from '@/lib/google-ads'

export const GOOGLE_ADS_OAUTH_STATE_COOKIE = 'nexora_google_ads_oauth_state'

export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set(GOOGLE_ADS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10,
  })

  return NextResponse.redirect(getGoogleAdsAuthUrl(state))
}

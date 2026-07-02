import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { exchangeMetaCodeForLongLivedToken, getMetaUserProfile } from '@/lib/meta-ads'

import { META_OAUTH_STATE_COOKIE } from '../connect/route'

// request.url/request.nextUrl reflect the container's bind address (0.0.0.0:8080)
// behind Railway's proxy, not the public domain — same class of bug already hit
// with Twilio callback URLs (see PROGRESS_LOG.md Session 6). Always build
// absolute redirect targets from APP_URL, never from the incoming request.
function redirectToSettings(params: Record<string, string>) {
  const url = new URL('/settings/integrations', process.env.APP_URL)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const oauthError = request.nextUrl.searchParams.get('error_message') || request.nextUrl.searchParams.get('error')

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(META_OAUTH_STATE_COOKIE)?.value
  cookieStore.delete(META_OAUTH_STATE_COOKIE)

  if (oauthError) {
    return redirectToSettings({ meta_error: oauthError })
  }

  if (!code || !state || state !== expectedState) {
    return redirectToSettings({ meta_error: 'Invalid or expired authorization attempt — please try connecting again.' })
  }

  try {
    const { accessToken, expiresAt } = await exchangeMetaCodeForLongLivedToken(code)
    const profile = await getMetaUserProfile(accessToken)

    await prisma.adPlatformConnection.upsert({
      where: { organizationId_platform: { organizationId: session.user.organizationId, platform: 'META' } },
      create: {
        organizationId: session.user.organizationId,
        platform: 'META',
        accessToken,
        tokenExpiresAt: expiresAt,
        externalId: profile.id,
        connectedByUserId: session.user.id,
        status: 'ACTIVE',
      },
      update: {
        accessToken,
        tokenExpiresAt: expiresAt,
        externalId: profile.id,
        connectedByUserId: session.user.id,
        status: 'ACTIVE',
      },
    })

    return redirectToSettings({ meta_connected: profile.name })
  } catch (err) {
    return redirectToSettings({ meta_error: err instanceof Error ? err.message : 'Failed to connect Meta' })
  }
}

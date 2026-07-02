import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

import { requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { exchangeGoogleAdsCode, getGoogleUserProfile } from '@/lib/google-ads'

import { GOOGLE_ADS_OAUTH_STATE_COOKIE } from '../connect/route'

// Same lesson as the Meta callback: build the redirect from APP_URL, never
// from request.url — behind Railway's proxy that resolves to the container's
// bind address (0.0.0.0:8080), not the public domain.
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
  const oauthError = request.nextUrl.searchParams.get('error')

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(GOOGLE_ADS_OAUTH_STATE_COOKIE)?.value
  cookieStore.delete(GOOGLE_ADS_OAUTH_STATE_COOKIE)

  if (oauthError) {
    return redirectToSettings({ google_ads_error: oauthError })
  }

  if (!code || !state || state !== expectedState) {
    return redirectToSettings({ google_ads_error: 'Invalid or expired authorization attempt — please try connecting again.' })
  }

  try {
    const { accessToken, refreshToken, expiresAt } = await exchangeGoogleAdsCode(code)
    const profile = await getGoogleUserProfile(accessToken)

    await prisma.adPlatformConnection.upsert({
      where: { organizationId_platform: { organizationId: session.user.organizationId, platform: 'GOOGLE_ADS' } },
      create: {
        organizationId: session.user.organizationId,
        platform: 'GOOGLE_ADS',
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
        externalId: profile.email,
        connectedByUserId: session.user.id,
        status: 'ACTIVE',
      },
      update: {
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
        externalId: profile.email,
        connectedByUserId: session.user.id,
        status: 'ACTIVE',
      },
    })

    return redirectToSettings({ google_ads_connected: profile.email })
  } catch (err) {
    return redirectToSettings({ google_ads_error: err instanceof Error ? err.message : 'Failed to connect Google Ads' })
  }
}

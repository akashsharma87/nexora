import { NextRequest, NextResponse } from 'next/server'

const publicRoutes = ['/login', '/register']

// NextAuth v5 uses 'authjs.session-token' / '__Secure-authjs.session-token'
// getToken() from next-auth/jwt defaults to the v4 cookie name and will always
// return null on v5. Read the cookie directly instead — the actual JWT
// verification happens server-side in each protected route.
function hasSessionCookie(request: NextRequest): boolean {
  const secureName = '__Secure-authjs.session-token'
  const insecureName = 'authjs.session-token'
  return Boolean(
    request.cookies.get(secureName)?.value || request.cookies.get(insecureName)?.value
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))
  const isAuthenticated = hasSessionCookie(request)

  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const publicOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : (process.env.NEXTAUTH_URL || request.nextUrl.origin)

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', publicOrigin)
    loginUrl.searchParams.set('callbackUrl', new URL(pathname, publicOrigin).href)
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthenticated && pathname === '/login') {
    return NextResponse.redirect(new URL('/', publicOrigin))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|api/register|api/webhooks|api/cron|_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)'],
}

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const publicRoutes = ['/login']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET ?? 'nexora-local-development-secret' })
  const isAuthenticated = Boolean(token)

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
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|.*\\..*).*)'],
}

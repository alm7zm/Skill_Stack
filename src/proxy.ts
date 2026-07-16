import { NextResponse, type NextRequest } from 'next/server'
import { copyAuthCookies, updateSession } from '@/lib/supabase/proxy'
import {
  LOCALE_COOKIE,
  isLocale,
  pathWithoutLocale,
  pickLocale,
  type Locale,
} from '@/lib/i18n'

/**
 * Renamed from `middleware` in Next 16 (the old convention is deprecated).
 * The proxy runtime is always nodejs and cannot be configured.
 *
 * Two jobs: put a locale on every URL, and keep signed-out visitors out of the app.
 */

/**
 * Route prefixes under /[lang] that require a session.
 *
 * /search and /certification are deliberately NOT here. The catalog is public
 * reference data: the landing page invites you to "browse certifications", so
 * walling it behind a login makes that CTA a lie, and these are the only pages
 * worth having a search engine index.
 *
 * /advisor is protected because every message costs money.
 */
const PROTECTED = [
  '/home',
  '/dashboard',
  '/advisor',
  '/plan',
  '/profile',
  '/settings',
]

function isProtected(path: string) {
  return PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))
}

function resolveLocale(request: NextRequest): Locale {
  // An explicit choice (the language switcher) outranks the browser's guess.
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen
  return pickLocale(request.headers.get('accept-language'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. No locale in the URL yet -> redirect to the best one. Cheap, and it runs
  //    before touching Supabase so unlocalised URLs cost no auth round-trip.
  const segment = pathname.split('/')[1]
  if (!isLocale(segment)) {
    const url = request.nextUrl.clone()
    url.pathname = `/${resolveLocale(request)}${pathname}`
    return NextResponse.redirect(url)
  }

  const locale = segment

  // 2. Refresh the session. `response` carries the new cookies.
  const { response, user } = await updateSession(request)

  // 3. Gate the app. Replaces the old "no auth, demo purposes" behaviour, which
  //    left every (app) route publicly readable.
  if (!user && isProtected(pathWithoutLocale(pathname, locale))) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/auth`
    url.searchParams.set('next', pathname)
    return copyAuthCookies(response, NextResponse.redirect(url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except:
     * - _next/static, _next/image, favicon.ico, static image files
     * - api/*         route handlers do their own auth; they must not be localised
     * - auth/callback the OAuth redirect URL is registered with Supabase and
     *                 Google — localising it would break sign-in
     */
    '/((?!_next/static|_next/image|api|auth/callback|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

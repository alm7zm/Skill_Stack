import { NextResponse, type NextRequest } from 'next/server'
import { copyAuthCookies, updateSession } from '@/lib/supabase/proxy'
import { IDLE_COOKIE, IDLE_MS, isIdle } from '@/lib/idle'
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

  // 2. Refresh the session. response() carries the new cookies.
  const { response, supabase, user } = await updateSession(request)

  // 3. Sign out an abandoned session before doing anything else with it.
  //    This is the half that enforces: the client timer clears the screen, but
  //    it can be turned off with JS, whereas nothing reaches a protected page
  //    without passing through here first.
  if (user && isIdle(request.cookies.get(IDLE_COOKIE)?.value)) {
    // Local scope: signing out one idle browser must not revoke the account's
    // other sessions. The default scope is global — see AccountMenu.
    await supabase.auth.signOut({ scope: 'local' })

    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/auth`
    url.searchParams.set('reason', 'idle')
    // No `next`: nudging someone back to where they were is friendly on a
    // deliberate sign-in, but the point here is that we do not know who is at
    // the keyboard now. Land them on a bare sign-in.
    const redirect = copyAuthCookies(response(), NextResponse.redirect(url))
    redirect.cookies.delete(IDLE_COOKIE)
    return redirect
  }

  // 4. Gate the app. Replaces the old "no auth, demo purposes" behaviour, which
  //    left every (app) route publicly readable.
  if (!user && isProtected(pathWithoutLocale(pathname, locale))) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/auth`
    url.searchParams.set('next', pathname)
    return copyAuthCookies(response(), NextResponse.redirect(url))
  }

  const out = response()

  // 5. This request IS activity, so restamp the clock. Only for signed-in
  //    users: an anonymous visitor has no session to expire.
  if (user) {
    out.cookies.set(IDLE_COOKIE, String(Date.now()), {
      path: '/',
      maxAge: Math.floor(IDLE_MS / 1000),
      sameSite: 'lax',
      // Readable by JS on purpose: the client timer shares this clock.
      httpOnly: false,
    })
  }

  return out
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

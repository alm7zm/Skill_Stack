import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth cookies and reports who (if anyone) is signed in.
 *
 * `response()` is a getter, not the response itself: the cookie adapter below
 * *replaces* the response object whenever it writes cookies, so a caller holding
 * a reference taken at return time would send a stale one — and any cookie
 * written after that (by a sign-out, say) would be silently dropped.
 *
 * Whatever `response()` gives back MUST be the one sent, or sessions stop
 * refreshing. A caller building its own redirect has to carry the cookies over —
 * see `copyAuthCookies`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Request cookies take no options by design — they exist only so the
          // rest of this request reads fresh values. The response cookies below
          // are the ones that carry options back to the browser.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not remove: this call is what refreshes an expired session.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // `supabase` comes back so the caller can sign out through it — that routes
  // the cleared cookies through the same setAll above, rebuilding `response`.
  // Deleting the cookies by hand would miss the chunked `.0`/`.1` variants the
  // adapter writes when a token is too big for one cookie.
  return { response: () => response, supabase, user }
}

/** Carry refreshed auth cookies onto a redirect built by the caller. */
export function copyAuthCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  return to
}

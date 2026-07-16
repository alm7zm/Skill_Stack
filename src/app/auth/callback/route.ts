import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { defaultLocale } from '@/lib/i18n'

/**
 * OAuth callback. Deliberately NOT under [lang] — this exact path is registered
 * with Supabase and Google, so localising it would break sign-in.
 *
 * Also the only place a Google refresh token is ever visible: Supabase surfaces
 * provider_refresh_token on the session from the code exchange and never again.
 * Not capturing it here makes background calendar sync impossible.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const storeGoogle = searchParams.get('store_google') === '1'

  // `next` comes from the query string. Only same-origin relative paths are
  // honoured, so this cannot be turned into an open redirect. Rejecting "//host"
  // matters: that is protocol-relative and would leave the site.
  const requested = searchParams.get('next') ?? ''
  const next =
    requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : `/${defaultLocale}/home`

  if (!code) {
    return NextResponse.redirect(`${origin}/${defaultLocale}/auth?error=missing_code`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/${defaultLocale}/auth?error=exchange_failed`)
  }

  // Only for the calendar-connect flow — the one consent that asks for offline access.
  if (storeGoogle && data.session?.provider_refresh_token && data.user) {
    try {
      const admin = createAdminClient()
      await admin.from('user_integrations').upsert(
        {
          user_id: data.user.id,
          provider: 'google',
          refresh_token: data.session.provider_refresh_token,
          scope: 'https://www.googleapis.com/auth/calendar.events',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      )
    } catch {
      // Sign-in worked; only the optional integration failed. Send them on
      // rather than blocking login on it.
      return NextResponse.redirect(`${origin}${next}?calendar=failed`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}

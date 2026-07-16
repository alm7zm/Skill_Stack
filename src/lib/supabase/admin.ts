import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role client. Bypasses RLS — never expose it to a browser, never use it
 * for anything a user-scoped client can do.
 *
 * It exists for exactly one reason: user_integrations has RLS enabled with zero
 * policies, so Google refresh tokens are unreachable from any browser session
 * even with a stolen JWT. Only this key can read them.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Throws loudly rather than silently
 * degrading, because a quiet failure here looks like "calendar sync is broken"
 * rather than "a key is missing".
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Calendar sync needs it to read stored ' +
        'Google refresh tokens (user_integrations is service-role only by design). ' +
        'Copy it from Supabase → Project Settings → API → service_role.'
    )
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

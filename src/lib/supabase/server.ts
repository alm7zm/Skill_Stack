import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Request-scoped client for server components, route handlers and server actions.
 * Runs as the signed-in user, so every query is filtered by RLS.
 *
 * Uses the getAll/setAll cookie API — the get/set/remove trio this file used
 * before is deprecated in @supabase/ssr 0.12.
 */
export async function createClient() {
  // cookies() is async in Next 16; the sync form was removed.
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server components cannot set cookies. Safe to swallow: proxy.ts
            // refreshes the session on every request.
          }
        },
      },
    }
  )
}

/** The signed-in user, or null. Never trust a client-supplied id instead. */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

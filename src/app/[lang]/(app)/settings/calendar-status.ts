import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Whether the user has a stored Google refresh token.
 *
 * Needs the admin client because user_integrations is service-role only. Returns
 * false — rather than throwing — when SUPABASE_SERVICE_ROLE_KEY is absent, so
 * settings still renders and simply offers "connect". The API route is where a
 * missing key becomes a loud, explained error.
 */
export async function isCalendarConnected(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('user_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-ish window per-user rate limit for the paid LLM routes.
 *
 * Counts a user's calls for `action` in the last `windowSeconds` and allows the
 * call only if under `limit`. Written with the service role against llm_calls,
 * which has RLS on and no policies — so a user cannot read, forge, or delete
 * their own counter to get around it.
 *
 * ponytail: count-then-insert is two statements, so two concurrent requests can
 * both pass and the limit can be exceeded by a small burst. That's fine for cost
 * control; swap for an atomic SECURITY DEFINER increment if it ever isn't.
 */
export async function rateLimit(
  userId: string,
  action: string,
  limit: number,
  windowSeconds = 60
): Promise<{ ok: boolean; retryAfter: number; remaining: number; limit: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await admin
    .from('llm_calls')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', since);

  // Fail OPEN on an infra error (table missing, DB blip). This is cost control,
  // not an auth boundary — bricking the advisor because the limiter hiccuped is
  // worse than the occasional over-limit call. The limit still holds whenever
  // the count succeeds.
  if (error) return { ok: true, retryAfter: 0, remaining: limit, limit };
  const used = count ?? 0;
  if (used >= limit) return { ok: false, retryAfter: windowSeconds, remaining: 0, limit };

  await admin.from('llm_calls').insert({ user_id: userId, action });
  // Opportunistic prune keeps the table bounded without a cron; only touches
  // this user's own stale rows. Add a periodic global sweep if it grows.
  await admin
    .from('llm_calls')
    .delete()
    .eq('user_id', userId)
    .eq('action', action)
    .lt('created_at', since);

  // remaining counts this call as spent.
  return { ok: true, retryAfter: 0, remaining: Math.max(0, limit - used - 1), limit };
}

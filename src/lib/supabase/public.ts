import { createClient } from '@supabase/supabase-js';

/**
 * Client for public, un-scoped reads — currently just the certification catalog.
 *
 * Deliberately NOT the one in ./server.ts. That one awaits cookies() to run
 * queries as the signed-in user, and touching cookies opts the whole route into
 * dynamic rendering. The catalog is identical for every visitor and readable
 * signed-out, so paying that cost would turn 80-odd prerendered pages into
 * per-request renders for nothing.
 *
 * No cookies means no session, so this is anon. That is the intended privilege:
 * the certifications RLS policy is `for select using (true)` and there is no
 * insert/update/delete policy, so this client cannot write. Do not reach for it
 * to read anything user-scoped — RLS would (correctly) return zero rows.
 */
export const publicClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

'use server';

import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';

/**
 * A signed-in user reporting a problem with the app, from the account menu.
 * Mirrors reportCertification, but not tied to a certification — it lands in
 * app_reports. The 200-char cap matches the table's check constraint.
 */
const schema = z.object({
  category: z.enum(['bug', 'content', 'idea', 'other']),
  message: z.string().trim().min(1).max(200),
});

export type ReportProblemResult = { ok: true } | { ok: false; error: 'auth' | 'invalid' | 'failed' };

export async function reportProblem(formData: FormData): Promise<ReportProblemResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'auth' };

  const parsed = schema.safeParse({
    category: formData.get('category'),
    message: formData.get('message'),
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = await createClient();
  // Set user_id explicitly: the insert policy is auth.uid() = user_id, so a
  // forged id fails the policy rather than writing under someone else's name.
  const { error } = await supabase.from('app_reports').insert({
    user_id: user.id,
    category: parsed.data.category,
    message: parsed.data.message,
  });

  if (error) {
    console.error('app report failed:', error.message);
    return { ok: false, error: 'failed' };
  }

  return { ok: true };
}

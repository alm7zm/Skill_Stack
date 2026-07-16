'use server';

import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';

/**
 * A user telling us a certification's data is wrong.
 *
 * The catalog is curated by hand off provider web pages, so it is wrong
 * eventually and by default silently. This is the cheap channel for the people
 * who find out first — usually by paying the price we quoted and it not matching.
 */

const reportSchema = z.object({
  certId: z.string().min(1).max(100),
  field: z.enum(['exam_cost', 'study_hours', 'exam_details', 'prerequisites', 'url', 'other']),
  message: z.string().trim().min(1).max(1000),
});

export type ReportResult = { ok: true } | { ok: false; error: 'auth' | 'invalid' | 'failed' };

export async function reportCertification(formData: FormData): Promise<ReportResult> {
  // The page this is called from is statically rendered and cannot know whether
  // you are signed in, so the button is always offered and the check lands here.
  // RLS enforces it a second time regardless — this branch exists to return a
  // useful message rather than a policy violation.
  const user = await getUser();
  if (!user) return { ok: false, error: 'auth' };

  const parsed = reportSchema.safeParse({
    certId: formData.get('certId'),
    field: formData.get('field'),
    message: formData.get('message'),
  });
  if (!parsed.success) return { ok: false, error: 'invalid' };

  const supabase = await createClient();
  const { error } = await supabase.from('certification_reports').insert({
    certification_id: parsed.data.certId,
    // Set explicitly because the insert policy is `auth.uid() = user_id`. A
    // forged id fails the policy rather than writing someone else's name.
    user_id: user.id,
    field: parsed.data.field,
    message: parsed.data.message,
  });

  if (error) {
    console.error('certification report failed:', error.message);
    return { ok: false, error: 'failed' };
  }

  return { ok: true };
}

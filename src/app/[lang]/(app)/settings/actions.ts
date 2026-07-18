'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getUser } from '@/lib/supabase/server';
import { ADVISOR_KNOBS, normalizeAdvisorSettings, type AdvisorKnob } from '@/lib/advisor-settings';

/**
 * Saves the advisor tuning knobs. Validation is normalizeAdvisorSettings: it
 * drops anything off-list, so the stored jsonb can only ever hold values the
 * prompt understands, no matter what the form posts.
 */
export async function updateAdvisorSettings(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const raw: Record<string, unknown> = {};
  for (const knob of Object.keys(ADVISOR_KNOBS) as AdvisorKnob[]) {
    raw[knob] = formData.get(knob);
  }
  const settings = normalizeAdvisorSettings(raw);

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ advisor_settings: settings })
    .eq('id', user.id);
  if (error) throw new Error(`Could not save settings: ${error.message}`);

  revalidatePath('/[lang]/settings', 'page');
}

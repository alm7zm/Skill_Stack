'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import { RESOURCE_FORMATS, RESOURCE_SITES } from '@/lib/resource-prefs';

/**
 * Server actions. Validation runs here because this is the trust boundary —
 * the client-side checks in the form are a convenience, not a guarantee.
 */

const profileSchema = z.object({
  full_name: z.string().trim().max(120).nullable(),
  career_goal: z.string().trim().max(300).nullable(),
  job_role: z.string().trim().max(120).nullable(),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable(),
  // Coerced because FormData values are always strings.
  budget: z.coerce.number().min(0).max(1_000_000).nullable(),
  daily_study_time: z.coerce.number().min(0).max(24).nullable(),
  weekly_availability: z.coerce.number().min(0).max(7).nullable(),
  // Closed vocabularies from the shared list. Anything off-list fails the parse
  // rather than reaching the row — the form only ever submits these, so an
  // unexpected value means a tampered request, not a user mistake.
  preferred_resource_formats: z.array(z.enum(RESOURCE_FORMATS)),
  preferred_resource_sites: z.array(z.enum(RESOURCE_SITES)),
});

const emptyToNull = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

export async function updateProfile(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const parsed = profileSchema.safeParse({
    full_name: emptyToNull(formData.get('full_name')),
    career_goal: emptyToNull(formData.get('career_goal')),
    job_role: emptyToNull(formData.get('job_role')),
    experience_level: emptyToNull(formData.get('experience_level')),
    budget: emptyToNull(formData.get('budget')),
    daily_study_time: emptyToNull(formData.get('daily_study_time')),
    weekly_availability: emptyToNull(formData.get('weekly_availability')),
    // Checkbox groups: getAll returns every checked value, or [] if none.
    preferred_resource_formats: formData.getAll('preferred_resource_formats'),
    preferred_resource_sites: formData.getAll('preferred_resource_sites'),
  });

  if (!parsed.success) throw new Error('Those values are not valid');

  const supabase = await createClient();
  // .eq('id', user.id) is belt-and-braces; the update policy already restricts
  // this to auth.uid() = id.
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', user.id);
  if (error) throw new Error(`Could not save profile: ${error.message}`);

  revalidatePath('/[lang]/profile', 'page');
}

const tagSchema = z.string().trim().min(1).max(60);

export async function addSkill(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const parsed = tagSchema.safeParse(formData.get('skill_name'));
  if (!parsed.success) return;

  const supabase = await createClient();
  // Ignores duplicates rather than erroring — unique(user_id, skill_name).
  await supabase
    .from('user_skills')
    .upsert({ user_id: user.id, skill_name: parsed.data }, { onConflict: 'user_id,skill_name' });

  revalidatePath('/[lang]/profile', 'page');
}

export async function removeSkill(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const name = String(formData.get('skill_name') ?? '');
  if (!name) return;

  const supabase = await createClient();
  await supabase.from('user_skills').delete().eq('user_id', user.id).eq('skill_name', name);

  revalidatePath('/[lang]/profile', 'page');
}

export async function addLanguage(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const parsed = tagSchema.safeParse(formData.get('language_name'));
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from('user_languages')
    .upsert(
      { user_id: user.id, language_name: parsed.data },
      { onConflict: 'user_id,language_name' }
    );

  revalidatePath('/[lang]/profile', 'page');
}

export async function removeLanguage(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const name = String(formData.get('language_name') ?? '');
  if (!name) return;

  const supabase = await createClient();
  await supabase.from('user_languages').delete().eq('user_id', user.id).eq('language_name', name);

  revalidatePath('/[lang]/profile', 'page');
}

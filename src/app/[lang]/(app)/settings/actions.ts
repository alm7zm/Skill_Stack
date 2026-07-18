'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLocale } from '@/lib/i18n';
import { ADVISOR_KNOBS, normalizeAdvisorSettings, type AdvisorKnob } from '@/lib/advisor-settings';
import { CURRENCIES } from '@/lib/currencies';

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
  if (error) {
    console.error('updateAdvisorSettings failed:', error.message);
    throw new Error('Could not save your settings. Please try again.');
  }

  revalidatePath('/[lang]/settings', 'page');
}

/**
 * The currency prices are shown in. Same column the profile writes; exposed here
 * too because it is a display preference, which is where a user looks for it.
 */
export async function updateCurrency(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const parsed = z.enum(CURRENCIES).safeParse(formData.get('budget_currency'));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ budget_currency: parsed.data })
    .eq('id', user.id);
  if (error) {
    console.error('updateCurrency failed:', error.message);
    throw new Error('Could not save your currency. Please try again.');
  }

  revalidatePath('/[lang]/settings', 'page');
  revalidatePath('/[lang]/profile', 'page');
}

/**
 * Permanently delete the account. Type-to-confirm (the posted value must equal
 * the account email) guards against a stray click, since there is no undo.
 */
export async function deleteAccount(formData: FormData) {
  const user = await getUser();
  if (!user) throw new Error('Not signed in');

  const confirm = String(formData.get('confirm') ?? '').trim();
  if (!user.email || confirm.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error('Type your email to confirm');
  }

  // Deleting the auth user cascades every row that references it (profiles ->
  // auth.users on delete cascade, and all user data off profiles). Needs the
  // service role: the request-scoped client runs as the user and cannot touch
  // auth.users. createAdminClient keeps that key in one server-only place.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('deleteAccount failed:', error.message);
    throw new Error('Could not delete your account. Please try again.');
  }

  // Drop the now-orphaned session, then leave the app.
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Validate the locale before it reaches redirect(): the field is client-set,
  // and `/` + a value like `/evil.com` would be a protocol-relative open
  // redirect. isLocale collapses anything unexpected back to 'en'.
  const langRaw = String(formData.get('lang') ?? 'en');
  redirect(`/${isLocale(langRaw) ? langRaw : 'en'}`);
}

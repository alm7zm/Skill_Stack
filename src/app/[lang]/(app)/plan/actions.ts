'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getResourcesForCertification } from '@/lib/data/resources';
import { isLocale } from '@/lib/i18n';
import { savePlanSchema, type SavePlanInput } from '@/lib/plan/schema';
import { normalizeWeeks, collectTopicIds, planTopicDiff } from '@/lib/plan/reconcile';

/**
 * Persist a whole plan and reconcile its topic rows atomically.
 *
 * Shared by the edit page (planId present → update) and the new page (planId
 * absent → insert, so an abandoned draft never leaves an empty plan). The write
 * goes through save_study_plan, which runs the row upsert + topic delete/insert
 * in one transaction — three separate PostgREST calls would each auto-commit and
 * could leave the plan jsonb pointing at topics that were never inserted.
 *
 * Returns { error } for the client to show; redirects on success. No user_id is
 * ever read from the input — the RPC stamps auth.uid(), enforced by RLS.
 */
export async function savePlan(input: SavePlanInput): Promise<{ error: string } | void> {
  if (!isLocale(input.lang)) return { error: 'Invalid request.' };

  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success)
    return { error: 'Please give every week and topic a title, and check the hours.' };
  const { planId, certId, summary, recommended, targetDate, weeks } = parsed.data;

  const supabase = await createClient();

  // Same guard as plan generation: a week may only reference resources that exist
  // for this certification. Silently drop anything else rather than store a dead id.
  const catalog = await getResourcesForCertification(certId);
  const allowed = new Set(catalog.map((r) => r.id));
  const cleanedWeeks = normalizeWeeks(weeks).map((w) => ({
    ...w,
    resourceIds: [...new Set(w.resourceIds)].filter((id) => allowed.has(id)),
  }));

  const plan = { summary, recommended, weeks: cleanedWeeks };

  let desiredIds: string[];
  try {
    desiredIds = collectTopicIds(plan);
  } catch {
    return { error: 'Two topics share an id. Please try again.' };
  }

  // Current ids are re-read here, not trusted from the client: they only decide
  // which rows to add or remove, and RLS scopes the read to the owner.
  let currentIds: string[] = [];
  if (planId) {
    const { data } = await supabase
      .from('study_plan_topics')
      .select('topic_id')
      .eq('study_plan_id', planId);
    currentIds = (data ?? []).map((r) => r.topic_id as string);
  }
  const { toInsert, toDelete } = planTopicDiff(currentIds, desiredIds);

  const { data: savedId, error } = await supabase.rpc('save_study_plan', {
    p_plan_id: planId ?? null,
    p_certification_id: certId,
    p_plan: plan,
    p_target_date: targetDate ? targetDate : null,
    p_insert_ids: toInsert,
    p_delete_ids: toDelete,
  });

  if (error || !savedId) {
    console.error('savePlan failed:', error?.message);
    return { error: 'Could not save the plan. Please try again.' };
  }

  revalidatePath(`/[lang]/plan/${savedId}`, 'page');
  revalidatePath('/[lang]/dashboard', 'page');
  redirect(`/${input.lang}/plan/${savedId}`);
}

/**
 * Delete a plan and all its progress. Topic rows cascade with the plan
 * (study_plan_topics FK is on delete cascade), and the delete policy scopes it to
 * the owner, so no user_id check is needed here. Returns { error } on failure;
 * redirects to the dashboard on success.
 */
export async function deletePlan(input: { lang: string; planId: string }): Promise<{ error: string } | void> {
  if (!isLocale(input.lang)) return { error: 'Invalid request.' };

  const supabase = await createClient();
  const { error } = await supabase.from('study_plans').delete().eq('id', input.planId);
  if (error) {
    console.error('deletePlan failed:', error.message);
    return { error: 'Could not delete the plan. Please try again.' };
  }

  revalidatePath('/[lang]/dashboard', 'page');
  redirect(`/${input.lang}/dashboard`);
}

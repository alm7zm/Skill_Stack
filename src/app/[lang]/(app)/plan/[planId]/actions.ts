'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Server action, so ticking a topic needs no client state and works without JS
 * when invoked from a plain <form action={...}>.
 *
 * No user_id check here on purpose: the update policy on study_plan_topics is
 * scoped through study_plans.user_id = auth.uid(), so RLS rejects a write to
 * someone else's topic. An application-level check you can forget is not a
 * security boundary; the database one cannot be bypassed.
 */
export async function toggleTopic(formData: FormData) {
  const planId = String(formData.get('planId') ?? '');
  const topicId = String(formData.get('topicId') ?? '');
  const completed = formData.get('completed') === 'true';

  if (!planId || !topicId) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from('study_plan_topics')
    .update({
      completed: !completed,
      // completed_at is what computeStreak reads, so it must be cleared on untick
      // or a streak would survive undoing the work that created it.
      completed_at: !completed ? new Date().toISOString() : null,
    })
    .eq('study_plan_id', planId)
    .eq('topic_id', topicId);

  if (error) throw new Error(`Could not update topic: ${error.message}`);

  revalidatePath(`/[lang]/plan/${planId}`, 'page');
  revalidatePath('/[lang]/dashboard', 'page');
}

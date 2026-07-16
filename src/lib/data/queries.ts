import { createClient } from '@/lib/supabase/server';
import { getCertificationById } from './certifications';
import { computeStreak } from '@/lib/streak';
import type { Certification, StudyWeek } from '@/lib/types';

export { computeStreak };

/**
 * Real reads against Supabase, replacing the hardcoded arrays and useCounter(12)
 * the old dashboard shipped.
 *
 * The certification catalog stays in certifications.ts: the schema has no
 * certifications table and study_plans.certification_id is a plain text key, so
 * the catalog is reference data, not user data. Only user-owned rows live in the DB.
 *
 * Every query relies on RLS to scope rows to the caller — none of them filter by
 * user_id in application code, because a filter you can forget is not a security
 * boundary.
 */

/**
 * The `plan` column holds whatever /api/advisor/plan generated — shape mirrors
 * planSchema in lib/ai/advisor.ts. Nullable because a plan row can exist before
 * generation finishes.
 */
export type StoredPlan = {
  summary?: string;
  recommended?: boolean;
  weeks: StudyWeek[];
};

export type PlanRow = {
  id: string;
  certification_id: string;
  target_date: string | null;
  created_at: string;
  plan: StoredPlan | null;
};

export type TopicRow = {
  topic_id: string;
  completed: boolean;
  completed_at: string | null;
  calendar_event_id: string | null;
};

export type PlanWithProgress = {
  row: PlanRow;
  certification: Certification | undefined;
  topics: TopicRow[];
  done: number;
  total: number;
  percentage: number;
};

export async function getPlans(): Promise<PlanRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('study_plans')
    .select('id, certification_id, target_date, created_at, plan')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load study plans: ${error.message}`);
  return data ?? [];
}

export async function getPlan(planId: string): Promise<PlanWithProgress | null> {
  const supabase = await createClient();

  const [{ data: row, error: planError }, { data: topics, error: topicError }] =
    await Promise.all([
      supabase
        .from('study_plans')
        .select('id, certification_id, target_date, created_at, plan')
        .eq('id', planId)
        .maybeSingle(),
      supabase
        .from('study_plan_topics')
        .select('topic_id, completed, completed_at, calendar_event_id')
        .eq('study_plan_id', planId),
    ]);

  // RLS turns "someone else's plan" into "no rows", which is the right answer to
  // give the caller anyway — it does not leak whether the id exists.
  if (planError) throw new Error(`Failed to load plan: ${planError.message}`);
  if (topicError) throw new Error(`Failed to load topics: ${topicError.message}`);
  if (!row) return null;

  return withProgress(row as PlanRow, (topics ?? []) as TopicRow[]);
}

function withProgress(row: PlanRow, topics: TopicRow[]): PlanWithProgress {
  const total = row.plan?.weeks.reduce((sum, w) => sum + w.topics.length, 0) ?? 0;
  const done = topics.filter((t) => t.completed).length;

  return {
    row,
    certification: getCertificationById(row.certification_id),
    topics,
    done,
    total,
    percentage: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export type DashboardData = {
  plans: PlanWithProgress[];
  streak: number;
  topicsDone: number;
  hoursPlanned: number;
  readiness: number;
};

export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();

  const plans = await getPlans();
  if (plans.length === 0) {
    return { plans: [], streak: 0, topicsDone: 0, hoursPlanned: 0, readiness: 0 };
  }

  const { data: topics, error } = await supabase
    .from('study_plan_topics')
    .select('study_plan_id, topic_id, completed, completed_at, calendar_event_id')
    .in(
      'study_plan_id',
      plans.map((p) => p.id)
    );
  if (error) throw new Error(`Failed to load progress: ${error.message}`);

  const byPlan = new Map<string, TopicRow[]>();
  for (const t of topics ?? []) {
    const list = byPlan.get(t.study_plan_id) ?? [];
    list.push(t as TopicRow);
    byPlan.set(t.study_plan_id, list);
  }

  const withProgressList = plans.map((p) => withProgress(p, byPlan.get(p.id) ?? []));

  const hoursPlanned = withProgressList.reduce(
    (sum, p) => sum + (p.row.plan?.weeks.reduce((h, w) => h + w.estimatedHours, 0) ?? 0),
    0
  );
  const topicsDone = withProgressList.reduce((sum, p) => sum + p.done, 0);
  const totalTopics = withProgressList.reduce((sum, p) => sum + p.total, 0);

  return {
    plans: withProgressList,
    streak: computeStreak((topics ?? []).map((t) => t.completed_at)),
    topicsDone,
    hoursPlanned,
    readiness: totalTopics === 0 ? 0 : Math.round((topicsDone / totalTopics) * 100),
  };
}

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  career_goal: string | null;
  job_role: string | null;
  experience_level: string | null;
  budget: number | null;
  daily_study_time: number | null;
  weekly_availability: number | null;
};

export async function getProfile(): Promise<{
  profile: ProfileRow | null;
  skills: string[];
  languages: string[];
}> {
  const supabase = await createClient();

  const [{ data: profile }, { data: skills }, { data: languages }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, full_name, avatar_url, career_goal, job_role, experience_level, budget, daily_study_time, weekly_availability'
      )
      .maybeSingle(),
    supabase.from('user_skills').select('skill_name'),
    supabase.from('user_languages').select('language_name'),
  ]);

  return {
    profile: (profile as ProfileRow) ?? null,
    skills: (skills ?? []).map((s) => s.skill_name),
    languages: (languages ?? []).map((l) => l.language_name),
  };
}

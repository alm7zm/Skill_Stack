import { createClient } from '@/lib/supabase/server';
import { getAllCertifications, getCertificationById } from './certifications';
import { computeStreak } from '@/lib/streak';
import type { Certification, StudyWeek } from '@/lib/types';

export { computeStreak };

/**
 * Real reads against Supabase, replacing the hardcoded arrays and useCounter(12)
 * the old dashboard shipped.
 *
 * Plans are user data and go through the request-scoped client, so RLS scopes
 * every row to the caller — none of these filter by user_id in application code,
 * because a filter you can forget is not a security boundary. The catalog is
 * public reference data and goes through the cookie-free client instead; joining
 * the two happens here, in memory, rather than in Postgres, because
 * study_plans.certification_id is a plain text key with no FK to certifications.
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

/**
 * The caller's plan id for a certification, or null. One plan per cert is enforced
 * by a unique(user_id, certification_id) constraint, so at most one row comes back.
 * RLS scopes it to the caller, so this never sees anyone else's plan.
 */
export async function getPlanIdForCert(certId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('study_plans')
    .select('id')
    .eq('certification_id', certId)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
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

  return withProgress(
    row as PlanRow,
    (topics ?? []) as TopicRow[],
    await getCertificationById((row as PlanRow).certification_id)
  );
}

/**
 * Synchronous and takes the certification rather than fetching it: this is
 * called once per plan, so a lookup inside would be one query per plan.
 */
function withProgress(
  row: PlanRow,
  topics: TopicRow[],
  certification: Certification | undefined
): PlanWithProgress {
  const total = row.plan?.weeks.reduce((sum, w) => sum + w.topics.length, 0) ?? 0;
  const done = topics.filter((t) => t.completed).length;

  return {
    row,
    certification,
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

  // One catalog read for every plan on the dashboard, not one per plan.
  const [{ data: topics, error }, catalog] = await Promise.all([
    supabase
      .from('study_plan_topics')
      .select('study_plan_id, topic_id, completed, completed_at, calendar_event_id')
      .in(
        'study_plan_id',
        plans.map((p) => p.id)
      ),
    getAllCertifications(),
  ]);
  if (error) throw new Error(`Failed to load progress: ${error.message}`);
  const byId = new Map(catalog.map((c) => [c.id, c]));

  const byPlan = new Map<string, TopicRow[]>();
  for (const t of topics ?? []) {
    const list = byPlan.get(t.study_plan_id) ?? [];
    list.push(t as TopicRow);
    byPlan.set(t.study_plan_id, list);
  }

  const withProgressList = plans.map((p) =>
    withProgress(p, byPlan.get(p.id) ?? [], byId.get(p.certification_id))
  );

  // Hours are summed from topics, not from the stored week total — a plan the
  // advisor generated (or one saved before hours became derived) may carry a
  // stale week.estimatedHours, but its topic hours are always the truth.
  const hoursPlanned = withProgressList.reduce(
    (sum, p) =>
      sum +
      (p.row.plan?.weeks.reduce(
        (h, w) => h + w.topics.reduce((th, t) => th + (t.estimatedHours || 0), 0),
        0
      ) ?? 0),
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
  budget_currency: string | null;
  daily_study_time: number | null;
  weekly_availability: number | null;
  preferred_resource_formats: string[];
  preferred_resource_sites: string[];
  advisor_settings: Record<string, unknown> | null;
  study_schedule: Record<string, unknown> | null;
};

/** A skill and how well the user knows it. level is null for skills added before
 * levels existed — the advisor omits it rather than guessing. */
export type SkillWithLevel = { name: string; level: string | null };

export async function getProfile(): Promise<{
  profile: ProfileRow | null;
  skills: SkillWithLevel[];
  languages: string[];
}> {
  const supabase = await createClient();

  const [{ data: profile }, { data: skills }, { data: languages }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, full_name, avatar_url, career_goal, job_role, experience_level, budget, budget_currency, daily_study_time, weekly_availability, preferred_resource_formats, preferred_resource_sites, advisor_settings, study_schedule'
      )
      .maybeSingle(),
    supabase.from('user_skills').select('skill_name, level'),
    supabase.from('user_languages').select('language_name'),
  ]);

  return {
    profile: (profile as ProfileRow) ?? null,
    skills: (skills ?? []).map((s) => ({ name: s.skill_name, level: s.level ?? null })),
    languages: (languages ?? []).map((l) => l.language_name),
  };
}

/**
 * A plan's own study-schedule override (study_plans.study_schedule), raw jsonb or
 * null. Callers normalize it. Tolerant of the column not existing yet — a missing
 * column returns an error the driver surfaces as null data, so pages never break
 * before the 20260720000002 migration is applied. RLS scopes the read to the owner.
 */
export async function getPlanScheduleRaw(planId: string): Promise<unknown> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('study_plans')
    .select('study_schedule')
    .eq('id', planId)
    .maybeSingle();
  return (data as { study_schedule?: unknown } | null)?.study_schedule ?? null;
}

/**
 * Just the currency the user wants prices shown in — for the cert lists and the
 * detail page, which don't otherwise need the whole profile. Falls back to USD
 * for signed-out visitors and profiles that never set one.
 */
export async function getUserCurrency(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('budget_currency').maybeSingle();
  return data?.budget_currency ?? 'USD';
}

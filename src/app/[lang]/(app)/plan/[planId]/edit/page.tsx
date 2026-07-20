import { notFound } from 'next/navigation';
import { getDictionary } from '../../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getPlan, getPlanScheduleRaw, getProfile } from '@/lib/data/queries';
import { getResourcesForCertification } from '@/lib/data/resources';
import { normalizeStudySchedule } from '@/lib/calendar/schedule';
import { PlanEditor } from '@/components/app/plan-editor';
import type { EditablePlan } from '@/lib/plan/types';

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ lang: string; planId: string }>;
}) {
  const { lang, planId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, plan] = await Promise.all([getDictionary(lang), getPlan(planId)]);
  if (!plan) notFound();

  const [catalog, planScheduleRaw, { profile }] = await Promise.all([
    getResourcesForCertification(plan.row.certification_id),
    getPlanScheduleRaw(planId),
    getProfile(),
  ]);
  // Prefill from this plan's own override if it has one, else the profile's
  // preferred schedule — saving here writes an override for this plan only.
  const initialSchedule =
    normalizeStudySchedule(planScheduleRaw) ?? normalizeStudySchedule(profile?.study_schedule);

  const initialPlan: EditablePlan = {
    summary: plan.row.plan?.summary,
    recommended: plan.row.plan?.recommended,
    weeks: (plan.row.plan?.weeks ?? []).map((w) => ({
      weekNumber: w.weekNumber,
      title: w.title,
      estimatedHours: w.estimatedHours,
      hasPracticeExam: w.hasPracticeExam,
      isReviewWeek: w.isReviewWeek,
      resourceIds: w.resourceIds ?? [],
      topics: w.topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        estimatedHours: t.estimatedHours,
      })),
    })),
  };

  return (
    <PlanEditor
      lang={lang}
      certId={plan.row.certification_id}
      planId={plan.row.id}
      initialPlan={initialPlan}
      initialTargetDate={plan.row.target_date ?? ''}
      initialSchedule={initialSchedule}
      scheduleLabels={{
        title: dict.studySchedule.planTitle,
        body: dict.studySchedule.planBody,
        from: dict.studySchedule.from,
        to: dict.studySchedule.to,
        timezoneNote: dict.studySchedule.timezoneNote,
      }}
      catalog={catalog}
      labels={dict.planEditor}
    />
  );
}

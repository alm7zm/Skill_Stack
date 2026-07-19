import { notFound } from 'next/navigation';
import { getDictionary } from '../../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getPlan } from '@/lib/data/queries';
import { getResourcesForCertification } from '@/lib/data/resources';
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

  const catalog = await getResourcesForCertification(plan.row.certification_id);

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
      catalog={catalog}
      labels={dict.planEditor}
    />
  );
}

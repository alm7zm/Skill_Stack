import { notFound, redirect } from 'next/navigation';
import { getDictionary } from '../../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getCertificationById } from '@/lib/data/certifications';
import { getResourcesForCertification } from '@/lib/data/resources';
import { getPlanIdForCert } from '@/lib/data/queries';
import { PlanEditor } from '@/components/app/plan-editor';

export default async function NewPlanPage({
  params,
}: {
  params: Promise<{ lang: string; certId: string }>;
}) {
  const { lang, certId } = await params;
  if (!isLocale(lang)) notFound();

  const cert = await getCertificationById(certId);
  if (!cert) notFound();

  // One plan per cert: if this cert already has one, never open a blank second —
  // send them to the plan they have.
  const existingPlanId = await getPlanIdForCert(cert.id);
  if (existingPlanId) redirect(`/${lang}/plan/${existingPlanId}`);

  const catalog = await getResourcesForCertification(cert.id);
  const dict = await getDictionary(lang);

  return (
    <PlanEditor
      lang={lang}
      certId={cert.id}
      initialPlan={{ weeks: [], summary: '', recommended: true }}
      catalog={catalog}
      labels={dict.planEditor}
    />
  );
}

import { notFound } from 'next/navigation';
import { getDictionary } from '../../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getCertificationById } from '@/lib/data/certifications';
import { getResourcesForCertification } from '@/lib/data/resources';
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

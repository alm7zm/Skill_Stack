import { notFound } from 'next/navigation';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getAllCertifications } from '@/lib/data/certifications';
import { getPlans } from '@/lib/data/queries';
import { PlanCertPicker } from '@/components/app/plan-cert-picker';

export default async function PickCertForPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, certs, plans] = await Promise.all([
    getDictionary(lang),
    getAllCertifications(),
    getPlans(),
  ]);
  const t = dict.plan.new;
  const planByCert = Object.fromEntries(plans.map((p) => [p.certification_id, p.id]));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
      <p className="mt-2 text-ink-muted">{t.subtitle}</p>

      <PlanCertPicker
        lang={lang}
        certs={certs.map((c) => ({ id: c.id, name: c.name, provider: c.provider }))}
        planByCert={planByCert}
        labels={{ search: dict.common.search, planned: t.planned, noMatch: t.noMatch }}
      />
    </div>
  );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getAllCertifications } from '@/lib/data/certifications';

export default async function PickCertForPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, certs] = await Promise.all([getDictionary(lang), getAllCertifications()]);
  const t = dict.plan.new;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
      <p className="mt-2 text-ink-muted">{t.subtitle}</p>

      <ul className="mt-8 flex flex-col divide-y divide-rule border-y border-rule">
        {certs.map((c) => (
          <li key={c.id}>
            <Link
              href={`/${lang}/plan/new/${c.id}`}
              className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-accent"
            >
              <span className="font-medium text-ink">{c.name}</span>
              <span className="text-xs text-ink-faint">{c.provider}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

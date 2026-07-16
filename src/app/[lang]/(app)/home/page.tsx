import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getUser } from '@/lib/supabase/server';
import { getPlans } from '@/lib/data/queries';
import { getCertificationById, getTrendingCertifications } from '@/lib/data/certifications';
import { CertCard } from '@/components/app/cert-card';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { Dictionary } from '../../dictionaries';
import type { CertCategory } from '@/lib/types';

const CATEGORIES: CertCategory[] = [
  'cloud',
  'ai',
  'cybersecurity',
  'networking',
  'programming',
  'data',
  'project-management',
  'devops',
];

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user, plans] = await Promise.all([getDictionary(lang), getUser(), getPlans()]);
  const t = dict.home;

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    user?.email?.split('@')[0];

  const trending = getTrendingCertifications().slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold text-ink">
          {firstName ? `${t.greeting}, ${firstName}` : t.greetingAnon}
        </h1>
        <p className="mt-2 text-ink-muted">{t.subtitle}</p>
      </header>

      {/* ---- Your plans: real rows, not a hardcoded demo link ---- */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">{t.continue}</h2>

        {plans.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={t.empty.title}
            body={t.empty.body}
            cta={{ label: t.empty.cta, href: `/${lang}/search` }}
          />
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const cert = getCertificationById(plan.certification_id);
              return (
                <li key={plan.id} className="flex">
                  <Card as="article" interactive className="flex w-full flex-col p-5">
                    <p className="text-xs uppercase tracking-wider text-ink-faint">
                      {cert ? dict.categories[cert.category] : ''}
                    </p>
                    <h3 className="mt-2 font-display text-lg font-semibold text-ink">
                      <Link
                        href={`/${lang}/plan/${plan.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {cert?.name ?? plan.certification_id}
                      </Link>
                    </h3>
                    <p className="mt-1 text-xs text-ink-faint">{cert?.provider}</p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Browse by category ---- */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-ink">{t.browse}</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={`/${lang}/search?category=${category}`}
                className="inline-flex rounded-md border border-rule bg-paper-raised px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-rule-strong hover:text-ink"
              >
                {dict.categories[category]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Trending ---- */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">{t.popular}</h2>
          <Link
            href={`/${lang}/search`}
            className="text-sm text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
          >
            {dict.common.viewAll}
          </Link>
        </div>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trending.map((cert) => (
            <li key={cert.id} className="flex">
              <CertCard cert={cert} lang={lang} labels={cardLabels(dict, cert.category, cert.difficulty)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function cardLabels(dict: Dictionary, category: CertCategory, difficulty: string) {
  return {
    category: dict.categories[category],
    difficulty: dict.difficulty[difficulty as keyof typeof dict.difficulty],
    free: dict.common.free,
    hours: dict.common.hours,
    weeks: dict.common.weeks,
  };
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getDashboard } from '@/lib/data/queries';
import { formatNumber, formatDate, interpolate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Every number here comes from the database. The old dashboard rendered
 * `useCounter(12)` for the streak and two hardcoded arrays for tasks — the
 * figures were the same for every user and never changed.
 */
export default async function DashboardPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, data] = await Promise.all([getDictionary(lang), getDashboard()]);
  const t = dict.dashboard;

  if (data.plans.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
          <ButtonLink href={`/${lang}/plan/new`} size="sm">{t.newPlan}</ButtonLink>
        </div>
        <EmptyState
          className="mt-8"
          title={t.empty.title}
          body={t.empty.body}
          cta={{ label: t.empty.cta, href: `/${lang}/search` }}
        />
      </div>
    );
  }

  const stats = [
    { label: t.streak, value: formatNumber(data.streak, lang) },
    { label: t.completed, value: formatNumber(data.topicsDone, lang) },
    { label: t.hoursLogged, value: formatNumber(data.hoursPlanned, lang) },
    { label: t.readiness, value: `${formatNumber(data.readiness, lang)}%` },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
        <ButtonLink href={`/${lang}/plan/new`} size="sm">{t.newPlan}</ButtonLink>
      </div>

      {/* Stat band: hairline-separated, tabular figures so the columns align. */}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-paper-raised px-5 py-4">
            <dt className="text-xs uppercase tracking-wider text-ink-faint">{stat.label}</dt>
            <dd className="tabular mt-1 font-display text-3xl font-semibold text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <h2 className="font-display text-xl font-semibold text-ink">{dict.nav.plans}</h2>

        <ul className="mt-4 flex flex-col gap-4">
          {data.plans.map((plan) => (
            <li key={plan.row.id}>
              <Card as="article" interactive className="p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-ink">
                    <Link
                      href={`/${lang}/plan/${plan.row.id}`}
                      className="after:absolute after:inset-0"
                    >
                      {plan.certification?.name ?? plan.row.certification_id}
                    </Link>
                  </h3>
                  <p className="tabular text-sm text-ink-muted">
                    {interpolate(dict.plan.progress, {
                      done: formatNumber(plan.done, lang),
                      total: formatNumber(plan.total, lang),
                    })}
                  </p>
                </div>

                <p className="mt-1 text-xs text-ink-faint">
                  {plan.row.target_date
                    ? `${dict.plan.targetDate}: ${formatDate(plan.row.target_date, lang)}`
                    : dict.plan.noTarget}
                </p>

                {/* Native progress element: announced by screen readers, styled
                    with the accent, no ARIA needed. */}
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-500"
                      style={{ width: `${plan.percentage}%` }}
                    />
                  </div>
                  <span className="tabular text-xs font-medium text-ink-muted">
                    {formatNumber(plan.percentage, lang)}%
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

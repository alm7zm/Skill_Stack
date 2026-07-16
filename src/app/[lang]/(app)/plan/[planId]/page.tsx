import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getPlan } from '@/lib/data/queries';
import { formatDate, formatNumber, interpolate, pluralUnit } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { toggleTopic } from './actions';

export default async function PlanPage({
  params,
}: {
  params: Promise<{ lang: string; planId: string }>;
}) {
  const { lang, planId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, plan] = await Promise.all([getDictionary(lang), getPlan(planId)]);

  // getPlan returns null both for "does not exist" and "not yours" — RLS makes
  // them indistinguishable, which is the right answer to give either way.
  if (!plan) notFound();

  const t = dict.plan;
  const weeks = plan.row.plan?.weeks ?? [];
  const doneIds = new Set(plan.topics.filter((x) => x.completed).map((x) => x.topic_id));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href={`/${lang}/dashboard`}
        className="text-xs text-ink-muted transition-colors hover:text-ink"
      >
        ← {dict.nav.dashboard}
      </Link>

      <header className="mt-4 border-b border-rule pb-6">
        <p className="text-xs uppercase tracking-wider text-ink-faint">{t.title}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
          {plan.certification?.name ?? plan.row.certification_id}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="tabular text-ink-muted">
            {interpolate(t.progress, {
              done: formatNumber(plan.done, lang),
              total: formatNumber(plan.total, lang),
            })}
          </span>
          <span className="text-ink-muted">
            {plan.row.target_date
              ? `${t.targetDate}: ${formatDate(plan.row.target_date, lang)}`
              : t.noTarget}
          </span>
        </div>

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
      </header>

      {plan.row.plan?.summary && (
        <p className="prose-measure mt-6 text-sm leading-relaxed text-ink-muted">
          {plan.row.plan.summary}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-6">
        {weeks.map((week) => (
          <Card as="section" key={week.weekNumber} className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
              <h2 className="font-display text-lg font-semibold text-ink">
                <span className="tabular text-accent">
                  {interpolate(t.week, { n: formatNumber(week.weekNumber, lang) })}
                </span>
                <span className="ms-3 text-ink">{week.title}</span>
              </h2>
              <span className="tabular text-xs text-ink-faint">
                {formatNumber(week.estimatedHours, lang)}{' '}
                {pluralUnit(dict.common.hours, week.estimatedHours, lang)}
              </span>
            </div>

            <ul className="mt-3 flex flex-col">
              {week.topics.map((topic) => {
                const done = doneIds.has(topic.id);
                return (
                  <li key={topic.id} className="border-b border-rule/50 last:border-0">
                    {/* A form, not an onClick — this works before hydration and
                        with JS off. */}
                    <form action={toggleTopic} className="flex items-start gap-3 py-3">
                      <input type="hidden" name="planId" value={plan.row.id} />
                      <input type="hidden" name="topicId" value={topic.id} />
                      <input type="hidden" name="completed" value={String(done)} />

                      <button
                        type="submit"
                        aria-pressed={done}
                        aria-label={done ? t.markNotDone : t.markDone}
                        className={`mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-xs border transition-colors ${
                          done
                            ? 'border-accent bg-accent text-paper'
                            : 'border-rule-strong bg-paper-raised hover:border-accent'
                        }`}
                      >
                        {done && (
                          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.5 6.5l2.5 2.5 4.5-5" />
                          </svg>
                        )}
                      </button>

                      <span className="flex-1">
                        <span
                          className={`block text-sm font-medium ${
                            done ? 'text-ink-faint line-through' : 'text-ink'
                          }`}
                        >
                          {topic.title}
                        </span>
                        <span className="block text-xs leading-relaxed text-ink-muted">
                          {topic.description}
                        </span>
                      </span>

                      {/* Full unit word, not hours[0] — slicing the first letter
                          off "ساعات" produces a meaningless orphaned glyph. */}
                      <span className="tabular flex-none whitespace-nowrap text-xs text-ink-faint">
                        {formatNumber(topic.estimatedHours, lang)}{' '}
                        {pluralUnit(dict.common.hours, topic.estimatedHours, lang)}
                      </span>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

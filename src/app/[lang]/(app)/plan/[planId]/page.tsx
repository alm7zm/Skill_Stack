import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { createClient, getUser } from '@/lib/supabase/server';
import { getPlan, getPlanScheduleRaw } from '@/lib/data/queries';
import { weekHours } from '@/lib/plan/reconcile';
import {
  buildSlots,
  formatSlot,
  normalizeStudySchedule,
  todayIn,
} from '@/lib/calendar/schedule';
import { isCalendarConnected } from '@/app/[lang]/(app)/settings/calendar-status';
import { getResourcesByIds } from '@/lib/data/resources';
import { siteOf } from '@/lib/resource-prefs';
import type { LearningResource } from '@/lib/types';
import { formatDate, formatNumber, interpolate, pluralUnit } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { DeletePlanButton } from '@/components/app/delete-plan-button';
import { SyncCalendarButton } from '@/components/app/sync-calendar-button';
import { toggleTopic } from './actions';

export default async function PlanPage({
  params,
}: {
  params: Promise<{ lang: string; planId: string }>;
}) {
  const { lang, planId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, plan, user] = await Promise.all([
    getDictionary(lang),
    getPlan(planId),
    getUser(),
  ]);

  // getPlan returns null both for "does not exist" and "not yours" — RLS makes
  // them indistinguishable, which is the right answer to give either way.
  if (!plan) notFound();

  const calendarConnected = await isCalendarConnected(user?.id);

  const t = dict.plan;
  const weeks = plan.row.plan?.weeks ?? [];

  // Where the study times come from: this plan's own schedule if it has one, else
  // the profile's preferred schedule — the same resolution the calendar uses, so
  // the plan shows exactly when each topic lands. Null until either is set.
  const supabase = await createClient();
  const [planScheduleRaw, { data: profile }] = await Promise.all([
    getPlanScheduleRaw(planId),
    supabase.from('profiles').select('study_schedule').eq('id', user?.id ?? '').maybeSingle(),
  ]);
  const schedule =
    normalizeStudySchedule(planScheduleRaw) ?? normalizeStudySchedule(profile?.study_schedule);
  const flatTopics = weeks.flatMap((w) => w.topics);
  const slotByTopic = schedule
    ? new Map(
        buildSlots(
          schedule,
          todayIn(schedule.timezone),
          flatTopics.map((x) => x.estimatedHours)
        ).map((slot, i) => [flatTopics[i].id, formatSlot(slot, lang)])
      )
    : null;
  const doneIds = new Set(plan.topics.filter((x) => x.completed).map((x) => x.topic_id));
  // "Update calendar" vs "Add" — any topic already carrying an event id means
  // this plan has been synced before.
  const alreadySynced = plan.topics.some((x) => x.calendar_event_id);

  // One query for the whole plan, not one per week. Resources moved to the
  // database, so a lookup inside the weeks.map() below would be a query per week
  // — the same N+1 the dashboard and home page already had to have fixed out.
  const resourceById = new Map(
    (await getResourcesByIds([...new Set(weeks.flatMap((w) => w.resourceIds ?? []))])).map((r) => [
      r.id,
      r,
    ])
  );

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

        <div className="mt-5 flex flex-wrap items-start gap-2">
          <ButtonLink href={`/${lang}/plan/${plan.row.id}/edit`} variant="secondary" size="sm">
            {t.edit}
          </ButtonLink>
          <SyncCalendarButton
            lang={lang}
            planId={plan.row.id}
            connected={calendarConnected}
            alreadySynced={alreadySynced}
            labels={{
              add: t.syncCalendar,
              syncing: t.syncing,
              synced: t.synced,
              resync: t.resync,
              connect: t.calendarConnect,
              settings: dict.nav.settings,
              error: t.calendarError,
            }}
          />
          <DeletePlanButton
            lang={lang}
            planId={plan.row.id}
            labels={{
              delete: dict.planEditor.delete,
              cancel: dict.planEditor.cancel,
              confirm: dict.planEditor.deleteConfirm,
            }}
          />
        </div>

        {!schedule && (
          <p className="mt-3 text-xs text-ink-muted">
            <Link
              href={`/${lang}/plan/${plan.row.id}/edit`}
              className="text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {t.setStudyTime}
            </Link>
          </p>
        )}
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
                {formatNumber(weekHours(week.topics), lang)}{' '}
                {pluralUnit(dict.common.hours, weekHours(week.topics), lang)}
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
                        {slotByTopic?.get(topic.id) && (
                          <span className="tabular mt-1 block text-xs font-medium text-accent">
                            {slotByTopic.get(topic.id)}
                          </span>
                        )}
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

            <WeekResources
              resources={(week.resourceIds ?? [])
                .map((id) => resourceById.get(id))
                .filter((r) => r !== undefined)}
              labels={{ title: t.resources, free: dict.common.free, paid: t.paid }}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * The week's reading, already resolved by the page.
 *
 * Renders nothing at all when there are none — 16 of the 28 certifications have
 * no curated resources, and an empty "Resources" heading on every week would be
 * a promise the catalog cannot keep.
 */
function WeekResources({
  resources,
  labels,
}: {
  resources: LearningResource[];
  labels: { title: string; free: string; paid: string };
}) {
  if (resources.length === 0) return null;

  return (
    <section className="mt-4 border-t border-rule pt-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {labels.title}
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {resources.map((r) => (
          <li key={r.id}>
            <a
              href={r.url}
              target="_blank"
              // noreferrer as well as noopener: these are third-party sites and
              // there is no reason to tell them which plan someone came from.
              rel="noopener noreferrer"
              className="group flex items-baseline gap-2 rounded-sm py-1 text-sm"
            >
              <span className="text-ink-muted underline decoration-rule-strong underline-offset-2 transition-colors group-hover:text-accent group-hover:decoration-accent">
                {r.title}
              </span>
              {/* Cost is a word, not a colour: "free" has to survive greyscale
                  and it is the single most load-bearing fact here. */}
              <span
                className={
                  r.free
                    ? 'flex-none rounded-xs bg-accent-wash px-1.5 py-0.5 text-[0.6875rem] font-medium text-accent'
                    : 'flex-none rounded-xs border border-rule px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink-faint'
                }
              >
                {r.free ? labels.free : labels.paid}
              </span>
              <span className="flex-none text-xs text-ink-faint">
                {siteOf(r.url) ? `${r.provider} · ${siteOf(r.url)}` : r.provider}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

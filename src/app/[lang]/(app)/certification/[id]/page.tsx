import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getCertificationById } from '@/lib/data/certifications';
import { getResourcesForCertification } from '@/lib/data/resources';
import { getUserCurrency } from '@/lib/data/queries';
import { siteOf } from '@/lib/resource-prefs';
import { getUser } from '@/lib/supabase/server';
import {
  formatCurrency,
  formatExamCost,
  formatDate,
  formatNumber,
  formatStudyTime,
  interpolate,
} from '@/lib/utils';
import { Card, CardWell } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DifficultyMeter } from '@/components/ui/difficulty-meter';
import { ButtonLink } from '@/components/ui/button';
import { ReportButton } from '@/components/app/report-button';
import type { LearningResource } from '@/lib/types';

// Curated types first, the (now large) YouTube video pile last, so the handful of
// official docs/courses is not buried under 20 playlists. cn is inlined below to
// avoid an import for one conditional class.
const RESOURCE_TYPE_ORDER: LearningResource['type'][] = [
  'course',
  'documentation',
  'practice-exam',
  'book',
  'video',
];

/**
 * Rendered per request, and deliberately not prerendered.
 *
 * This started as `export const revalidate = 3600` + generateStaticParams. The
 * build output showed the route as ƒ (Dynamic) anyway: the (app) layout calls
 * getUser() to draw the nav, reading cookies opts the whole segment into dynamic
 * rendering, and a page under it cannot be prerendered no matter what it exports.
 * Both were dead code, so they are gone.
 *
 * Being dynamic is the better answer here regardless: correcting a price in the
 * Supabase dashboard shows up on the next request rather than up to an hour
 * later, and the read is a primary-key lookup on a table of a few dozen rows.
 * If this ever needs prerendering, the thing to change is the layout's cookie
 * read (or reach for Cache Components), not this file.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cert = await getCertificationById(id);
  if (!cert) return {};
  return { title: `${cert.name} — SkillStack`, description: cert.description };
}

export default async function CertificationPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();

  const cert = await getCertificationById(id);
  if (!cert) notFound();

  // Free: the (app) layout already reads cookies to draw the nav, so this route
  // is server-rendered per request either way. Knowing the user up front means a
  // signed-out visitor is sent to sign in *before* writing a report, rather than
  // after — a form action resets the form, so asking afterwards discards
  // everything they just typed.
  const [dict, resources, user, currency] = await Promise.all([
    getDictionary(lang),
    getResourcesForCertification(cert.id),
    getUser(),
    getUserCurrency(),
  ]);
  const t = dict.certification;

  const facts = [
    {
      label: t.examCost,
      value:
        cert.examCost === 0
          ? dict.common.free
          : formatExamCost(cert.examCost, cert.examCostCurrency, currency, lang),
    },
    {
      label: t.studyTime,
      value: formatStudyTime(cert.estimatedStudyHours, lang, {
        hours: dict.common.hours,
        weeks: dict.common.weeks,
      }),
    },
    { label: t.provider, value: cert.provider },
  ];

  // Grouped by type so the list is scannable instead of one long wall, and so the
  // curated docs/courses sit above the large pile of seeded video playlists.
  const anyPaid = resources.some((r) => !r.free);
  const resourceGroups = RESOURCE_TYPE_ORDER.map((type) => ({
    type,
    items: resources.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);
  const showGroupLabels = resourceGroups.length > 1;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href={`/${lang}/search`}
        className="text-xs text-ink-muted transition-colors hover:text-ink"
      >
        ← {dict.nav.discover}
      </Link>

      <header className="mt-4 border-b border-rule pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{dict.categories[cert.category]}</Badge>
          {cert.free && <Badge tone="accent">{dict.common.free}</Badge>}
        </div>

        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-ink">
          {cert.name}
        </h1>
        <p className="prose-measure mt-3 text-lg leading-relaxed text-ink-muted">
          {cert.description}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <DifficultyMeter difficulty={cert.difficulty} label={dict.difficulty[cert.difficulty]} />
          {facts.map((f) => (
            <span key={f.label} className="text-sm text-ink-muted">
              <span className="text-ink-faint">{f.label}: </span>
              <span className="tabular font-medium text-ink">{f.value}</span>
            </span>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href={`/${lang}/advisor/${cert.id}`} size="lg">
            {t.askAdvisor}
          </ButtonLink>
          <ButtonLink href={cert.officialUrl} variant="link" target="_blank" rel="noopener noreferrer">
            {cert.provider} ↗
          </ButtonLink>
        </div>

        {/* The catalogue is curated by hand — no provider publishes an API for
            it — so it goes stale silently. Saying when it was last checked, next
            to a link to the source, is the difference between reference data and
            a number someone books a $300 exam on.

            This date is now per-certification rather than one constant for all
            of them, so re-checking this exam's price no longer claims that every
            other row was re-checked too. */}
        {/* div, not p: ReportButton renders a <dialog>, which is flow content and
            cannot legally sit inside a <p>. The browser closes the paragraph
            early and hydration then mismatches. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          <span>
            {interpolate(t.verified, {
              date: formatDate(cert.verifiedAt, lang),
              provider: cert.provider,
            })}
          </span>
          <ReportButton
            certId={cert.id}
            lang={lang}
            signedIn={!!user}
            labels={{
              open: t.report.open,
              title: t.report.title,
              body: t.report.body,
              fieldLabel: t.report.fieldLabel,
              fields: t.report.fields,
              messageLabel: t.report.messageLabel,
              messagePlaceholder: t.report.messagePlaceholder,
              submit: t.report.submit,
              sending: t.report.sending,
              thanks: t.report.thanks,
              signIn: t.report.signIn,
              error: t.report.error,
              cancel: dict.common.cancel,
            }}
          />
        </div>
      </header>

      <div className="mt-10 grid gap-10 md:grid-cols-12">
        <div className="md:col-span-7">
          <section>
            <h2 className="font-display text-xl font-semibold text-ink">{t.topics}</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {cert.skillsGained.map((skill) => (
                <li
                  key={skill}
                  className="rounded-sm border border-rule bg-paper-raised px-2.5 py-1 text-sm text-ink-muted"
                >
                  {skill}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink">{t.prerequisites}</h2>
            {cert.prerequisites.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">{t.noPrerequisites}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {cert.prerequisites.map((p) => (
                  <li key={p} className="text-sm text-ink-muted">
                    — {p}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold text-ink">{t.resources}</h2>
            {resourceGroups.length === 0 ? (
              <p className="mt-3 text-sm text-ink-faint">—</p>
            ) : (
              <div className="mt-4 flex flex-col gap-6">
                {resourceGroups.map(({ type, items }) => (
                  <div key={type}>
                    {/* One "Videos" header over the whole list would be noise, so
                        labels appear only once the resources span more than one type. */}
                    {showGroupLabels && (
                      <h3 className="flex items-baseline gap-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
                        {t.resourceTypes[type]}
                        <span className="tabular text-ink-faint/70">{items.length}</span>
                      </h3>
                    )}
                    <ul className={`flex flex-col gap-2${showGroupLabels ? ' mt-2.5' : ''}`}>
                      {items.map((r) => {
                        // Site is derived from the url, not stored. Shown only when
                        // it is a platform we recognise; unknown hosts get no tag.
                        const site = siteOf(r.url);
                        return (
                          <li key={r.id}>
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-4 rounded-md border border-rule bg-paper-raised px-4 py-3 transition-colors hover:border-rule-strong"
                            >
                              <span>
                                <span className="block text-sm font-medium text-ink">{r.title}</span>
                                <span className="block text-xs text-ink-faint">
                                  {r.provider} · {r.duration}
                                  {site ? ` · ${site}` : ''}
                                </span>
                              </span>
                              {/* A "Free" badge on every row informs nothing — show it
                                  only when some resource is paid and this one isn't. */}
                              {anyPaid && r.free && <Badge tone="accent">{dict.common.free}</Badge>}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Careers: real salary bands from the catalog, tabular so they align. */}
        <aside className="md:col-span-5">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">{t.careers}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {cert.careerOpportunities.map((job) => (
                <li key={job.title}>
                  <CardWell className="px-3 py-2.5">
                    <p className="text-sm font-medium text-ink">{job.title}</p>
                    <p className="tabular mt-0.5 text-xs text-ink-muted">
                      {t.salary}: {formatCurrency(job.salaryMin, lang, job.currency)} –{' '}
                      {formatCurrency(job.salaryMax, lang, job.currency)}
                    </p>
                  </CardWell>
                </li>
              ))}
            </ul>

            <dl className="mt-5 border-t border-rule pt-4 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-ink-faint">{dict.certification.overview}</dt>
                <dd className="tabular text-ink">
                  {formatNumber(cert.numberOfQuestions, lang)} · {formatNumber(cert.examDuration, lang)}m
                </dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

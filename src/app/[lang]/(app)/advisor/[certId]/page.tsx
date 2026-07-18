import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../../dictionaries';
import { isLocale, type Locale } from '@/lib/i18n';
import { getCertificationById } from '@/lib/data/certifications';
import { getProfile } from '@/lib/data/queries';
import { formatCurrency, formatNumber, pluralUnit } from '@/lib/utils';
import { AdvisorChat } from '@/components/app/advisor-chat';

export default async function AdvisorPage({
  params,
}: {
  params: Promise<{ lang: string; certId: string }>;
}) {
  const { lang, certId } = await params;
  if (!isLocale(lang)) notFound();

  const cert = await getCertificationById(certId);
  if (!cert) notFound();

  const [dict, { profile, skills, languages }] = await Promise.all([
    getDictionary(lang),
    getProfile(),
  ]);
  const t = dict.advisor;

  const known = summarise(profile, skills, languages, lang, dict);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col px-6 py-8">
      <header className="border-b border-rule pb-5">
        {/* Every page needs a way back — the old build dead-ended here. */}
        <Link
          href={`/${lang}/certification/${cert.id}`}
          className="text-xs text-ink-muted transition-colors hover:text-ink"
        >
          ← {cert.name}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.subtitle}</p>
      </header>

      {/* Shown, not just fed to the model. The advisor is about to reason from
          these and skip asking about them, so they need to be visible and
          correctable — otherwise a stale profile quietly shapes the plan. */}
      {known.length > 0 && (
        <section className="mt-5 rounded-lg border border-rule bg-paper-sunken px-4 py-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-ink-faint">
            {t.known.title}
          </h2>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
            {known.map((f) => (
              <div key={f.label} className="flex items-baseline gap-1.5 text-sm">
                <dt className="text-ink-faint">{f.label}</dt>
                <dd className="font-medium text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-xs text-ink-muted">
            {t.known.body}{' '}
            <Link
              href={`/${lang}/profile`}
              className="underline decoration-rule-strong underline-offset-2 transition-colors hover:text-accent"
            >
              {t.known.edit}
            </Link>
          </p>
        </section>
      )}

      <div className="flex-1 pt-6">
        <AdvisorChat
          certId={cert.id}
          lang={lang}
          labels={{
            placeholder: t.placeholder,
            send: t.send,
            thinking: t.thinking,
            viewPlan: t.viewPlan,
            restart: t.restart,
            error: t.error,
            // With a profile on file the generic opening ("why are you going for
            // it?") is the one question the profile cannot answer anyway, but the
            // wording promises a full interview. Open narrower instead.
            opening: known.length > 0 ? t.openingKnown : t.opening,
            status: t.status,
            quota: t.quota,
          }}
        />
      </div>
    </div>
  );
}

type Dict = Awaited<ReturnType<typeof getDictionary>>;

/**
 * The profile facts the advisor will treat as settled, in the user's language.
 *
 * Separate from knownFacts() in lib/ai/advisor.ts on purpose: that one writes
 * English for a system prompt and cares what the model needs, this one is user
 * copy and formats numbers and currency per locale. Merging them would mean one
 * of the two consumers gets the wrong language.
 */
function summarise(
  profile: {
    career_goal?: string | null;
    job_role?: string | null;
    experience_level?: string | null;
    budget?: number | null;
    budget_currency?: string | null;
    daily_study_time?: number | null;
    weekly_availability?: number | null;
  } | null,
  skills: { name: string; level: string | null }[],
  languages: string[],
  lang: Locale,
  dict: Dict
): { label: string; value: string }[] {
  if (!profile && skills.length === 0 && languages.length === 0) return [];

  const t = dict.profile;
  const facts: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    facts.push({ label, value });
  };

  push(t.careerGoal, profile?.career_goal);
  push(t.jobRole, profile?.job_role);

  const level = profile?.experience_level;
  if (level && level in dict.difficulty) {
    push(t.experienceLevel, dict.difficulty[level as keyof Dict['difficulty']]);
  }

  if (profile?.daily_study_time) {
    push(
      t.dailyStudyTime,
      `${formatNumber(profile.daily_study_time, lang)} ${pluralUnit(
        dict.common.hours,
        profile.daily_study_time,
        lang
      )}`
    );
  }

  if (profile?.weekly_availability) {
    push(t.weeklyAvailability, formatNumber(profile.weekly_availability, lang));
  }

  // 0 is meaningful here — "free resources only" — so it must not be dropped by
  // a falsy check the way the two above deliberately are (0 hours a day is not
  // a fact worth stating, it is an unfinished profile).
  if (profile?.budget !== null && profile?.budget !== undefined) {
    push(
      t.budget,
      profile.budget === 0
        ? dict.advisor.known.freeOnly
        : formatCurrency(profile.budget, lang, profile.budget_currency ?? 'USD')
    );
  }

  // Shown because the advisor now reads them. Until this commit both lists were
  // collected and never used by anything.
  if (skills.length > 0) {
    const list = skills
      .map((s) =>
        s.level && s.level in dict.difficulty
          ? `${s.name} (${dict.difficulty[s.level as keyof Dict['difficulty']]})`
          : s.name
      )
      .join(', ');
    push(dict.advisor.known.skills, list);
  }
  if (languages.length > 0) push(dict.advisor.known.languages, languages.join(', '));

  return facts;
}

import { notFound } from 'next/navigation';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getProfile } from '@/lib/data/queries';
import { getUser } from '@/lib/supabase/server';
import { DIFFICULTY_ORDER } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/app/avatar';
import { addLanguage, addSkill, removeLanguage, removeSkill, updateProfile } from './actions';

/**
 * Server component + server actions, so the whole page works without client JS.
 *
 * Every field carries a hint, because every one of them was ambiguous and two
 * were actively misleading: "Budget for learning" named no currency, no period,
 * and did not mention that 0 silently restricts the advisor to free resources;
 * "Languages" could as easily have meant Python as Arabic. These answers steer
 * the advisor now, so vagueness here comes back as a worse plan.
 *
 * Local Row/Select rather than components/ui/field.tsx: Field is a client
 * component (it owns reveal + error state), and this page has no interactive
 * state at all. Reusing it would ship JS to render static hint text.
 */
export default async function ProfilePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user, { profile, skills, languages }] = await Promise.all([
    getDictionary(lang),
    getUser(),
    getProfile(),
  ]);

  const t = dict.profile;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-center gap-4 border-b border-rule pb-6">
        <Avatar
          name={profile?.full_name}
          email={profile?.email ?? user?.email}
          src={profile?.avatar_url}
          size={56}
        />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-ink">
            {profile?.full_name || t.title}
          </h1>
          <p className="truncate text-sm text-ink-muted">{profile?.email ?? user?.email}</p>
        </div>
      </header>

      {/* Answers "why am I filling this in", which nothing on the page did. */}
      <p className="prose-measure mt-6 text-sm leading-relaxed text-ink-muted">{t.lede}</p>

      <form action={updateProfile} className="mt-8 flex flex-col gap-8">
        <section className="flex flex-col gap-5">
          <SectionHeading>{t.sectionAbout}</SectionHeading>

          <Row label={t.fullName} name="full_name" defaultValue={profile?.full_name ?? ''} />
          <Row
            label={t.jobRole}
            name="job_role"
            hint={t.jobRoleHint}
            placeholder={t.jobRolePlaceholder}
            defaultValue={profile?.job_role ?? ''}
          />
          <Row
            label={t.careerGoal}
            name="career_goal"
            hint={t.careerGoalHint}
            placeholder={t.careerGoalPlaceholder}
            maxLength={300}
            defaultValue={profile?.career_goal ?? ''}
          />

          <Select
            label={t.experienceLevel}
            name="experience_level"
            hint={t.experienceLevelHint}
            defaultValue={profile?.experience_level ?? ''}
            options={[
              { value: '', label: '—' },
              ...DIFFICULTY_ORDER.map((d) => ({ value: d, label: dict.difficulty[d] })),
            ]}
          />
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeading>{t.sectionTime}</SectionHeading>

          <div className="grid gap-5 sm:grid-cols-2">
            <Row
              label={t.dailyStudyTime}
              name="daily_study_time"
              hint={t.dailyStudyTimeHint}
              type="number"
              step="0.5"
              min="0"
              // 16, not 24. Nobody studies 24 hours in a day, and a boundary that
              // accepts an impossible answer is not a boundary. The server still
              // guards this; this is the honest hint about what is plausible.
              max="16"
              placeholder="1.5"
              defaultValue={profile?.daily_study_time?.toString() ?? ''}
            />
            <Row
              label={t.weeklyAvailability}
              name="weekly_availability"
              hint={t.weeklyAvailabilityHint}
              type="number"
              min="0"
              max="7"
              placeholder="5"
              defaultValue={profile?.weekly_availability?.toString() ?? ''}
            />
          </div>

          <Row
            label={t.budget}
            name="budget"
            hint={t.budgetHint}
            type="number"
            min="0"
            step="1"
            placeholder="0"
            suffix={t.budgetSuffix}
            defaultValue={profile?.budget?.toString() ?? ''}
          />
        </section>

        <Button type="submit" className="self-start">
          {dict.common.save}
        </Button>
      </form>

      <TagSection
        title={t.skills}
        hint={t.skillsHint}
        emptyLabel={t.empty}
        items={skills}
        name="skill_name"
        addLabel={t.addSkill}
        removeLabel={t.remove}
        addAction={addSkill}
        removeAction={removeSkill}
      />

      <TagSection
        title={t.languages}
        hint={t.languagesHint}
        emptyLabel={t.empty}
        items={languages}
        name="language_name"
        addLabel={t.addLanguage}
        removeLabel={t.remove}
        addAction={addLanguage}
        removeAction={removeLanguage}
      />
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-rule pb-2 text-xs font-medium uppercase tracking-wider text-ink-faint">
      {children}
    </h2>
  );
}

/**
 * Hints are wired with aria-describedby, not just placed nearby: a screen reader
 * that announces "Budget for study materials, edit text" and stops has told the
 * user exactly as little as the old label did.
 */
function Row({
  label,
  name,
  hint,
  suffix,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
  /** Unit rendered inside the field. For budget, where "150" alone is ambiguous. */
  suffix?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-ink-faint">
          {hint}
        </p>
      )}
      <div className="relative">
        <input
          id={name}
          name={name}
          aria-describedby={hint ? hintId : undefined}
          className={`h-10 w-full rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong ${
            suffix ? 'pe-14' : ''
          }`}
          {...props}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute end-3 top-0 flex h-10 items-center text-xs text-ink-faint"
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Select({
  label,
  name,
  hint,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  hint?: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs leading-relaxed text-ink-faint">
          {hint}
        </p>
      )}
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        aria-describedby={hint ? hintId : undefined}
        className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TagSection({
  title,
  hint,
  emptyLabel,
  items,
  name,
  addLabel,
  removeLabel,
  addAction,
  removeAction,
}: {
  title: string;
  hint: string;
  emptyLabel: string;
  items: string[];
  name: string;
  addLabel: string;
  removeLabel: string;
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const hintId = `${name}-hint`;

  return (
    <section className="mt-10" aria-labelledby={`${name}-heading`}>
      <h2 id={`${name}-heading`} className="font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      {/* These two lists were write-only until now: you could add to them and
          nothing ever read them back. They feed the advisor, and the hint is
          where that becomes visible rather than a thing you have to be told. */}
      <p id={hintId} className="prose-measure mt-1 text-xs leading-relaxed text-ink-faint">
        {hint}
      </p>

      <Card className="mt-3 p-4">
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <form action={removeAction} className="contents">
                <input type="hidden" name={name} value={item} />
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-rule bg-paper-sunken py-1 pe-1 ps-2.5 text-sm text-ink">
                  {item}
                  <button
                    type="submit"
                    aria-label={`${removeLabel}: ${item}`}
                    className="rounded-xs p-0.5 text-ink-faint transition-colors hover:bg-danger-wash hover:text-danger"
                  >
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                </span>
              </form>
            </li>
          ))}
          {/* "—" said nothing. This says what is true. */}
          {items.length === 0 && <li className="text-sm text-ink-faint">{emptyLabel}</li>}
        </ul>

        <form action={addAction} className="mt-4 flex gap-2">
          <input
            name={name}
            required
            maxLength={60}
            placeholder={addLabel}
            // "e.g. Linux" is a placeholder, not a name — on its own a screen
            // reader announces the example and never the question. The heading
            // names it; the hint says what it is for.
            aria-label={title}
            aria-describedby={hintId}
            className="h-9 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
          />
          <Button type="submit" variant="secondary" size="sm">
            +
          </Button>
        </form>
      </Card>
    </section>
  );
}

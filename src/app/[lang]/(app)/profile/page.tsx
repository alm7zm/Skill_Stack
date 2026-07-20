import { notFound } from 'next/navigation';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getProfile } from '@/lib/data/queries';
import { getUser } from '@/lib/supabase/server';
import { DIFFICULTY_ORDER } from '@/lib/utils';
import { normalizeStudySchedule } from '@/lib/calendar/schedule';
import { saveStudySchedule } from '@/app/[lang]/(app)/settings/actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/app/avatar';
import { StudyScheduleForm } from '@/components/app/study-schedule-form';
import { RESOURCE_FORMATS, RESOURCE_SITES } from '@/lib/resource-prefs';
import { EXAM_LANGUAGES } from '@/lib/languages';
import { CURRENCIES } from '@/lib/currencies';
import { addLanguage, addSkill, removeLanguage, removeSkill, updateProfile } from './actions';

/** The three levels a skill can carry (labels come from dict.difficulty). */
const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

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
            // Re-key on the saved value: a Server Action resets uncontrolled
            // fields to their mount-time defaultValue, which snaps a <select>
            // back to the old value even though the new one saved. Remounting on
            // the saved value makes it initialise to what was just stored.
            key={`experience_level-${profile?.experience_level ?? ''}`}
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

          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <Row
              label={t.budget}
              name="budget"
              hint={t.budgetHint}
              type="number"
              min="0"
              step="1"
              placeholder="0"
              defaultValue={profile?.budget?.toString() ?? ''}
            />
            <Select
              // See experience_level above — remount so the saved currency
              // sticks after the Server Action instead of snapping back.
              key={`budget_currency-${profile?.budget_currency ?? 'USD'}`}
              label={t.budgetCurrency}
              name="budget_currency"
              defaultValue={profile?.budget_currency ?? 'USD'}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <SectionHeading>{t.sectionPreferences}</SectionHeading>

          <CheckboxGroup
            legend={t.preferredFormats}
            hint={t.preferredFormatsHint}
            name="preferred_resource_formats"
            options={RESOURCE_FORMATS.map((f) => ({ value: f, label: t.formats[f] }))}
            selected={new Set(profile?.preferred_resource_formats ?? [])}
          />

          <CheckboxGroup
            legend={t.preferredSites}
            hint={t.preferredSitesHint}
            name="preferred_resource_sites"
            // Site labels are brand names; they read the same in every language.
            options={RESOURCE_SITES.map((s) => ({ value: s, label: s }))}
            selected={new Set(profile?.preferred_resource_sites ?? [])}
          />
        </section>

        <Button type="submit" className="self-start">
          {dict.common.save}
        </Button>
      </form>

      <section className="mt-10" aria-labelledby="study-schedule-heading">
        <h2 id="study-schedule-heading" className="font-display text-lg font-semibold text-ink">
          {dict.studySchedule.profileTitle}
        </h2>
        <p className="prose-measure mt-1 text-xs leading-relaxed text-ink-faint">
          {dict.studySchedule.profileBody}
        </p>
        <Card className="mt-3 p-4">
          <StudyScheduleForm
            lang={lang}
            initial={normalizeStudySchedule(profile?.study_schedule)}
            action={saveStudySchedule}
            labels={{
              from: dict.studySchedule.from,
              to: dict.studySchedule.to,
              timezoneNote: dict.studySchedule.timezoneNote,
              save: dict.common.save,
            }}
          />
        </Card>
      </section>

      <TagSection
        title={t.skills}
        hint={t.skillsHint}
        emptyLabel={t.empty}
        items={skills.map((s) => ({
          value: s.name,
          label:
            s.level && s.level in dict.difficulty
              ? `${s.name} · ${dict.difficulty[s.level as keyof typeof dict.difficulty]}`
              : s.name,
        }))}
        name="skill_name"
        addLabel={t.addSkill}
        removeLabel={t.remove}
        addAction={addSkill}
        removeAction={removeSkill}
        levelSelect={{
          name: 'skill_level',
          label: t.skillLevel,
          options: SKILL_LEVELS.map((l) => ({ value: l, label: dict.difficulty[l] })),
        }}
      />

      <TagSection
        title={t.languages}
        hint={t.languagesHint}
        emptyLabel={t.empty}
        // Existing entries show localized when we recognise them; anything added
        // before this became a fixed list falls back to its stored text.
        items={languages.map((l) => ({
          value: l,
          label: dict.languageNames[l as keyof typeof dict.languageNames] ?? l,
        }))}
        name="language_name"
        addLabel={t.addLanguage}
        removeLabel={t.remove}
        addAction={addLanguage}
        removeAction={removeLanguage}
        selectOptions={EXAM_LANGUAGES.map((l) => ({ value: l, label: dict.languageNames[l] }))}
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
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
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
      <input
        id={name}
        name={name}
        aria-describedby={hint ? hintId : undefined}
        className="h-10 w-full rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
        {...props}
      />
    </div>
  );
}

/**
 * A multi-select rendered as checkboxes, not <select multiple>: the native
 * multi-select is a known usability trap (you have to know to ctrl-click, and
 * touch devices barely support it), and checkboxes submit the same way — every
 * checked box posts its value under the shared name, so the action reads them
 * with formData.getAll. No client JS; the checked state is server-rendered.
 */
function CheckboxGroup({
  legend,
  hint,
  name,
  options,
  selected,
}: {
  legend: string;
  hint: string;
  name: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
}) {
  const hintId = `${name}-hint`;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-ink">{legend}</legend>
      <p id={hintId} className="text-xs leading-relaxed text-ink-faint">
        {hint}
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-rule bg-paper-raised px-3 py-1.5 text-sm text-ink hover:border-rule-strong has-[:checked]:border-accent has-[:checked]:bg-paper-sunken"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={selected.has(o.value)}
              aria-describedby={hintId}
              className="accent-accent"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
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

/**
 * Both tag lists (skills, languages) share this chip layout. Two optional props
 * cover where they differ: `datalist` gives the add-input native type-to-filter
 * suggestions (languages), and `levelSelect` adds a second field to the add form
 * (a skill's proficiency). Items carry a separate value/label so a skill can be
 * removed by its bare name while displaying "Linux · Advanced".
 */
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
  selectOptions,
  levelSelect,
}: {
  title: string;
  hint: string;
  emptyLabel: string;
  items: { value: string; label: string }[];
  name: string;
  addLabel: string;
  removeLabel: string;
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
  /** When set, the add field is a restricted dropdown of these options rather
   * than a free-text input — so only real values can be added, shown localized. */
  selectOptions?: { value: string; label: string }[];
  /** A second select in the add form, e.g. a skill's level. */
  levelSelect?: { name: string; label: string; options: { value: string; label: string }[] };
}) {
  const hintId = `${name}-hint`;

  return (
    <section className="mt-10" aria-labelledby={`${name}-heading`}>
      <h2 id={`${name}-heading`} className="font-display text-lg font-semibold text-ink">
        {title}
      </h2>
      {/* These two lists were write-only until recently: you could add to them
          and nothing ever read them back. They feed the advisor, and the hint is
          where that becomes visible rather than a thing you have to be told. */}
      <p id={hintId} className="prose-measure mt-1 text-xs leading-relaxed text-ink-faint">
        {hint}
      </p>

      <Card className="mt-3 p-4">
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.value}>
              <form action={removeAction} className="contents">
                <input type="hidden" name={name} value={item.value} />
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-rule bg-paper-sunken py-1 pe-1 ps-2.5 text-sm text-ink">
                  {item.label}
                  <button
                    type="submit"
                    aria-label={`${removeLabel}: ${item.value}`}
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
          {selectOptions ? (
            // Restricted: only a real, catalog-matchable value can be added, and
            // the empty placeholder + required means you must pick one.
            <select
              name={name}
              required
              defaultValue=""
              aria-label={title}
              aria-describedby={hintId}
              className="h-9 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
            >
              <option value="" disabled>
                {addLabel}
              </option>
              {selectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
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
          )}
          {levelSelect && (
            <select
              name={levelSelect.name}
              aria-label={levelSelect.label}
              className="h-9 rounded-md border border-rule bg-paper-raised px-2 text-sm text-ink hover:border-rule-strong"
            >
              {levelSelect.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" variant="secondary" size="sm">
            +
          </Button>
        </form>
      </Card>
    </section>
  );
}

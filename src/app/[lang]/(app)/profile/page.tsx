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
 * Reads the real profile row instead of the old build's hardcoded strings.
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
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {profile?.full_name || t.title}
          </h1>
          <p className="text-sm text-ink-muted">{profile?.email ?? user?.email}</p>
        </div>
      </header>

      <form action={updateProfile} className="mt-8 flex flex-col gap-5">
        <Row label={t.fullName} name="full_name" defaultValue={profile?.full_name ?? ''} />
        <Row label={t.jobRole} name="job_role" defaultValue={profile?.job_role ?? ''} />
        <Row label={t.careerGoal} name="career_goal" defaultValue={profile?.career_goal ?? ''} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="experience_level" className="text-sm font-medium text-ink">
            {t.experienceLevel}
          </label>
          <select
            id="experience_level"
            name="experience_level"
            defaultValue={profile?.experience_level ?? ''}
            className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
          >
            <option value="">—</option>
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {dict.difficulty[d]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Row
            label={t.dailyStudyTime}
            name="daily_study_time"
            type="number"
            step="0.5"
            min="0"
            max="24"
            defaultValue={profile?.daily_study_time?.toString() ?? ''}
          />
          <Row
            label={t.weeklyAvailability}
            name="weekly_availability"
            type="number"
            min="0"
            max="7"
            defaultValue={profile?.weekly_availability?.toString() ?? ''}
          />
          <Row
            label={t.budget}
            name="budget"
            type="number"
            min="0"
            defaultValue={profile?.budget?.toString() ?? ''}
          />
        </div>

        <Button type="submit" className="self-start">
          {dict.common.save}
        </Button>
      </form>

      <TagSection
        title={t.skills}
        items={skills}
        name="skill_name"
        addLabel={t.addSkill}
        removeLabel={t.remove}
        addAction={addSkill}
        removeAction={removeSkill}
      />

      <TagSection
        title={t.languages}
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

function Row({
  label,
  name,
  ...props
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
        {...props}
      />
    </div>
  );
}

function TagSection({
  title,
  items,
  name,
  addLabel,
  removeLabel,
  addAction,
  removeAction,
}: {
  title: string;
  items: string[];
  name: string;
  addLabel: string;
  removeLabel: string;
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>

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
          {items.length === 0 && <li className="text-sm text-ink-faint">—</li>}
        </ul>

        <form action={addAction} className="mt-4 flex gap-2">
          <input
            name={name}
            required
            maxLength={60}
            placeholder={addLabel}
            aria-label={addLabel}
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

import { notFound } from 'next/navigation';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getUser } from '@/lib/supabase/server';
import { getProfile } from '@/lib/data/queries';
import { ADVISOR_KNOBS, normalizeAdvisorSettings, type AdvisorKnob } from '@/lib/advisor-settings';
import { CURRENCIES } from '@/lib/currencies';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { CalendarConnect } from '@/components/app/calendar-connect';
import { SignOutButton } from '@/components/app/sign-out-button';
import { isCalendarConnected } from './calendar-status';
import { updateAdvisorSettings, updateCurrency, deleteAccount } from './actions';

export default async function SettingsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user, { profile }] = await Promise.all([
    getDictionary(lang),
    getUser(),
    getProfile(),
  ]);
  const t = dict.settings;
  const connected = await isCalendarConnected(user?.id);
  const advisor = normalizeAdvisorSettings(profile?.advisor_settings);
  const currency = profile?.budget_currency ?? 'USD';

  const ta = t.advisor;
  const knobs: { key: AdvisorKnob; label: string; options: Record<string, string>; hint: string }[] =
    [
      { key: 'tone', label: ta.tone, options: ta.toneOptions, hint: ta.toneHint },
      { key: 'length', label: ta.length, options: ta.lengthOptions, hint: ta.lengthHint },
      { key: 'questions', label: ta.questions, options: ta.questionsOptions, hint: ta.questionsHint },
      { key: 'intensity', label: ta.intensity, options: ta.intensityOptions, hint: ta.intensityHint },
    ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>

      <section className="mt-8">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{t.language}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.languageBody}</p>
          <LanguageSwitcher current={lang} label={dict.a11y.switchLanguage} className="mt-4" />
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{t.currency}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.currencyBody}</p>
          <form action={updateCurrency} className="mt-4 flex items-center gap-3">
            <select
              // Remount on the saved value so it sticks after the Server Action,
              // same reason as the advisor selects above.
              key={`budget_currency-${currency}`}
              name="budget_currency"
              defaultValue={currency}
              aria-label={t.currency}
              className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button type="submit">{dict.common.save}</Button>
          </form>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{ta.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{ta.body}</p>
          <form action={updateAdvisorSettings} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {knobs.map((k) => (
                // key includes the saved value: React resets uncontrolled form
                // fields to their defaultValue after a Server Action, which would
                // snap these back to the old default even though the new value
                // persisted. Re-keying on the value forces a remount so the
                // select initialises to what was just saved.
                <div key={`${k.key}-${advisor[k.key]}`} className="flex flex-col gap-1.5">
                  <label htmlFor={`advisor-${k.key}`} className="text-sm font-medium text-ink">
                    {k.label}
                  </label>
                  {/* What each option actually changes — otherwise the labels
                      (Direct/Balanced/Warm) name a spectrum without saying which
                      way is which. */}
                  <p id={`advisor-${k.key}-hint`} className="text-xs leading-relaxed text-ink-faint">
                    {k.hint}
                  </p>
                  <select
                    id={`advisor-${k.key}`}
                    name={k.key}
                    defaultValue={advisor[k.key]}
                    aria-describedby={`advisor-${k.key}-hint`}
                    className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
                  >
                    {ADVISOR_KNOBS[k.key].map((opt) => (
                      <option key={opt} value={opt}>
                        {k.options[opt]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <Button type="submit" className="self-start">
              {dict.common.save}
            </Button>
          </form>
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{t.calendar}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.calendarBody}</p>
          <CalendarConnect
            lang={lang}
            connected={connected}
            labels={{
              connect: t.calendarConnect,
              disconnect: t.calendarDisconnect,
              connected: t.calendarConnected,
            }}
          />
        </Card>
      </section>

      <section className="mt-6">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{t.account}</h2>
          <p className="mt-1 text-sm text-ink-muted">{user?.email}</p>
          <SignOutButton lang={lang} label={t.signOut} className="mt-4" />

          <div className="mt-6 border-t border-rule pt-5">
            <h3 className="text-sm font-medium text-danger">{t.dangerZone}</h3>
            <p className="mt-1 text-sm text-ink-muted">{t.dangerBody}</p>
            {/* Type-to-confirm: the input must match the account email, so a
                one-click destructive submit can't fire by accident. Validated
                again server-side in deleteAccount. */}
            <form action={deleteAccount} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="lang" value={lang} />
              <input
                name="confirm"
                required
                autoComplete="off"
                placeholder={t.deleteConfirm}
                aria-label={t.deleteConfirm}
                className="h-9 min-w-56 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
              />
              <button
                type="submit"
                className="h-9 rounded-md border border-danger/40 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-wash"
              >
                {t.delete}
              </button>
            </form>
          </div>
        </Card>
      </section>
    </div>
  );
}

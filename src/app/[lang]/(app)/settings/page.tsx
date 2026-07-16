import { notFound } from 'next/navigation';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getUser } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/app/language-switcher';
import { CalendarConnect } from '@/components/app/calendar-connect';
import { SignOutButton } from '@/components/app/sign-out-button';
import { isCalendarConnected } from './calendar-status';

export default async function SettingsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getUser()]);
  const t = dict.settings;
  const connected = await isCalendarConnected(user?.id);

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
        </Card>
      </section>
    </div>
  );
}

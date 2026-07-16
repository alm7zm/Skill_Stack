import { notFound } from 'next/navigation';
import { getDictionary } from '../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getUser } from '@/lib/supabase/server';
import { AppNav } from '@/components/app/app-nav';
import { Avatar } from '@/components/app/avatar';

/**
 * Server component. Only AppNav is a client island (it needs the active path).
 * The old shell marked the whole thing "use client" and then rendered a
 * hardcoded "U" avatar because no user was ever fetched.
 *
 * proxy.ts already redirects signed-out visitors away from these routes; this
 * read is for display, and is safe because getUser() validates with the auth
 * server rather than trusting the cookie.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, user] = await Promise.all([getDictionary(lang), getUser()]);

  const name = (user?.user_metadata?.full_name as string | undefined) ?? null;
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav
        lang={lang}
        labels={{
          home: dict.nav.home,
          discover: dict.nav.discover,
          dashboard: dict.nav.dashboard,
          profile: dict.nav.profile,
          settings: dict.nav.settings,
          switchLanguage: dict.a11y.switchLanguage,
          openMenu: dict.a11y.openMenu,
          closeMenu: dict.a11y.closeMenu,
          signIn: dict.nav.signIn,
        }}
        user={user ? { name, email: user.email ?? '' } : null}
        avatar={<Avatar name={name} email={user?.email} src={avatarUrl} size={32} />}
      />

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}

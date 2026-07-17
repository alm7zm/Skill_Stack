import { notFound, redirect } from 'next/navigation';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getUser } from '@/lib/supabase/server';
import { Logo } from '@/components/app/logo';
import { UpdatePasswordForm } from '@/components/app/update-password-form';

/**
 * Where a password-reset link lands, after /auth/callback has exchanged the code
 * for a session.
 *
 * Reaching this without a session means the link expired, was already used, or
 * someone typed the URL — there is no password to change, so send them to sign
 * in rather than render a form that can only fail.
 */
export default async function UpdatePasswordPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const user = await getUser();
  if (!user) redirect(`/${lang}/auth`);

  const dict = await getDictionary(lang);
  const t = dict.auth.update;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="paper-grid paper-grid-fade absolute inset-0" aria-hidden="true" />

      <header className="relative mx-auto w-full max-w-6xl px-6 py-6">
        <Logo href={`/${lang}`} size="md" />
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t.body}</p>

          <UpdatePasswordForm
            lang={lang}
            labels={{
              newPassword: t.newPassword,
              submit: t.submit,
              done: t.done,
              expired: t.expired,
              generic: dict.auth.errors.generic,
              passwordShort: dict.auth.errors.passwordShort,
              password: dict.auth.password,
            }}
          />
        </div>
      </main>
    </div>
  );
}

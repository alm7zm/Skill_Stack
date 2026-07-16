import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../dictionaries';
import { isLocale } from '@/lib/i18n';
import { Logo } from '@/components/app/logo';
import { AuthForm } from '@/components/app/auth-form';

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const { next, error } = await searchParams;
  const dict = await getDictionary(lang);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="paper-grid paper-grid-fade absolute inset-0" aria-hidden="true" />

      <header className="relative mx-auto w-full max-w-6xl px-6 py-6">
        <Logo href={`/${lang}`} size="md" />
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold text-ink">{dict.auth.title}</h1>
          <p className="mt-2 text-sm text-ink-muted">{dict.auth.subtitle}</p>

          <AuthForm
            lang={lang}
            next={next}
            initialError={error}
            labels={{
              google: dict.auth.google,
              emailLabel: dict.auth.emailLabel,
              emailPlaceholder: dict.auth.emailPlaceholder,
              passwordLabel: dict.auth.passwordLabel,
              signIn: dict.auth.signIn,
              signUp: dict.auth.signUp,
              noAccount: dict.auth.noAccount,
              hasAccount: dict.auth.hasAccount,
              or: dict.auth.or,
              checkEmail: dict.auth.checkEmail,
              errors: dict.auth.errors,
            }}
          />

          <p className="mt-8 text-center text-xs text-ink-faint">
            <Link href={`/${lang}`} className="hover:text-ink transition-colors">
              {dict.common.back}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

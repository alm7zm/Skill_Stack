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
          {/* The heading is rendered by AuthForm: it changes with the mode, and
              the mode is client state. */}
          <AuthForm
            lang={lang}
            next={next}
            initialError={error}
            labels={{
              title: dict.auth.title,
              subtitle: dict.auth.subtitle,
              signUpTitle: dict.auth.signUpTitle,
              signUpSubtitle: dict.auth.signUpSubtitle,
              resetTitle: dict.auth.resetTitle,
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
              forgot: dict.auth.forgot,
              backToSignIn: dict.auth.reset.back,
              resetBody: dict.auth.reset.body,
              resetSubmit: dict.auth.reset.submit,
              resetSent: dict.auth.reset.sent,
              password: dict.auth.password,
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

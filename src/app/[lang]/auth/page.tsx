import { notFound } from 'next/navigation';
import { getDictionary } from '../dictionaries';
import { isLocale } from '@/lib/i18n';
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

  // The heading is rendered by AuthForm: it changes with the mode, and the mode
  // is client state. Page chrome (logo, language switcher, back) is in layout.tsx.
  return (
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
        nameLabel: dict.auth.nameLabel,
        namePlaceholder: dict.auth.namePlaceholder,
        terms: dict.auth.terms,
        emailLabel: dict.auth.emailLabel,
        emailPlaceholder: dict.auth.emailPlaceholder,
        passwordLabel: dict.auth.passwordLabel,
        confirmLabel: dict.auth.confirmLabel,
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
        resend: dict.auth.resend,
        password: dict.auth.password,
        errors: dict.auth.errors,
      }}
    />
  );
}

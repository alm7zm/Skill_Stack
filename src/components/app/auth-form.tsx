'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { Locale } from '@/lib/i18n';

type Labels = {
  google: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  signIn: string;
  signUp: string;
  noAccount: string;
  hasAccount: string;
  or: string;
  checkEmail: string;
  errors: {
    generic: string;
    invalid: string;
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordShort: string;
  };
};

/**
 * Validation runs before the network call and errors render inline next to the
 * field. The old build had no validation at all and surfaced failures through
 * window.alert().
 *
 * Client-side validation is a UX affordance, not a security boundary — Supabase
 * and the database constraints remain the real check.
 */
export function AuthForm({
  lang,
  next,
  initialError,
  labels,
}: {
  lang: Locale;
  next?: string;
  initialError?: string;
  labels: Labels;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>(
    initialError ? { form: labels.errors.generic } : {}
  );
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  function validate() {
    const found: typeof errors = {};
    if (!email.trim()) found.email = labels.errors.emailRequired;
    // Deliberately loose: the only authority on whether an address exists is a
    // delivered email. A strict regex mostly rejects valid addresses.
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = labels.errors.emailInvalid;

    if (!password) found.password = labels.errors.passwordRequired;
    else if (mode === 'signup' && password.length < 8) found.password = labels.errors.passwordShort;

    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(undefined);
    if (!validate()) return;

    setBusy(true);
    const supabase = createClient();

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback?next=${next ?? `/${lang}/home`}` },
          });

    setBusy(false);

    if (result.error) {
      setErrors({ form: mode === 'signin' ? labels.errors.invalid : labels.errors.generic });
      return;
    }

    if (mode === 'signup' && !result.data.session) {
      setNotice(labels.checkEmail); // confirmation required
      return;
    }

    router.push(next ?? `/${lang}/home`);
    router.refresh(); // let the server components pick up the new session
  }

  async function signInWithGoogle() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next ?? `/${lang}/home`)}`,
      },
    });
    if (error) {
      setBusy(false);
      setErrors({ form: labels.errors.generic });
    }
  }

  return (
    <div className="mt-8">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={signInWithGoogle}
        disabled={busy}
        className="w-full"
      >
        <GoogleMark />
        {labels.google}
      </Button>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-rule" />
        <span className="text-xs uppercase tracking-wider text-ink-faint">{labels.or}</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label={labels.emailLabel}
          type="email"
          name="email"
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />

        <Field
          label={labels.passwordLabel}
          type="password"
          name="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        {errors.form && (
          <p role="alert" className="rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">
            {errors.form}
          </p>
        )}

        {notice && (
          <p role="status" className="rounded-sm bg-accent-wash px-3 py-2 text-sm text-accent">
            {notice}
          </p>
        )}

        <Button type="submit" size="lg" disabled={busy} className="w-full">
          {mode === 'signin' ? labels.signIn : labels.signUp}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {mode === 'signin' ? labels.noAccount : labels.hasAccount}{' '}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setErrors({});
            setNotice(undefined);
          }}
          className="text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
        >
          {mode === 'signin' ? labels.signUp : labels.signIn}
        </button>
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

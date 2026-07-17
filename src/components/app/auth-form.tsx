'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordMeter } from '@/components/ui/password-meter';
import { passwordStrength, type PasswordRule } from '@/lib/password';
import type { StrengthLevel } from '@/lib/password';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';

type Mode = 'signin' | 'signup' | 'reset';

type Labels = {
  /** One per mode: the heading has to say what the button is about to do. */
  title: string;
  subtitle: string;
  signUpTitle: string;
  signUpSubtitle: string;
  resetTitle: string;
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
  forgot: string;
  backToSignIn: string;
  resetBody: string;
  resetSubmit: string;
  resetSent: string;
  password: {
    show: string;
    hide: string;
    strength: string;
    levels: Record<StrengthLevel, string>;
    rules: Record<PasswordRule, string>;
  };
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
 *
 * Errors appear on blur once a field has been touched, then live as you type.
 * Validating every keystroke from the first character tells someone their email
 * is invalid while they are still typing the local part.
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
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>(
    initialError ? { form: labels.errors.generic } : {}
  );
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  function emailError(value: string) {
    if (!value.trim()) return labels.errors.emailRequired;
    // Deliberately loose: the only authority on whether an address exists is a
    // delivered email. A strict regex mostly rejects valid addresses.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return labels.errors.emailInvalid;
    return undefined;
  }

  function passwordError(value: string) {
    if (!value) return labels.errors.passwordRequired;
    // Length only. The meter nudges towards stronger, but composition rules are
    // not enforced — see lib/password.ts.
    if (mode === 'signup' && !passwordStrength(value).acceptable) return labels.errors.passwordShort;
    return undefined;
  }

  function validate() {
    const found: typeof errors = { email: emailError(email) };
    if (mode !== 'reset') found.password = passwordError(password);

    setErrors(found);
    setTouched({ email: true, password: true });
    return !found.email && !found.password;
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setErrors({});
    setTouched({});
    setNotice(undefined);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(undefined);
    if (!validate()) return;

    setBusy(true);
    const supabase = createClient();
    const callback = (dest: string) =>
      `${location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: callback(`/${lang}/auth/update`),
      });
      setBusy(false);
      // Always report success. Saying "no account with that email" turns the
      // reset form into a way to test which addresses are registered here.
      if (error) console.error('reset request failed:', error.message);
      setNotice(labels.resetSent);
      return;
    }

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: callback(next ?? `/${lang}/home`) },
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

  const submitLabel =
    mode === 'signin' ? labels.signIn : mode === 'signup' ? labels.signUp : labels.resetSubmit;

  // The heading lives here rather than in the page because mode is client state,
  // and a page-level <h1> cannot follow it — leaving "Sign in to SkillStack"
  // above a "Create account" button.
  const heading =
    mode === 'signin'
      ? { title: labels.title, subtitle: labels.subtitle }
      : mode === 'signup'
        ? { title: labels.signUpTitle, subtitle: labels.signUpSubtitle }
        : { title: labels.resetTitle, subtitle: labels.resetBody };

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">{heading.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{heading.subtitle}</p>

      {mode !== 'reset' && (
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
        </div>
      )}

      {/* In reset mode there is no Google block above, so the form supplies its
          own top margin instead of inheriting the divider's. */}
      <form
        onSubmit={onSubmit}
        noValidate
        className={cn('flex flex-col gap-4', mode === 'reset' && 'mt-8')}
      >
        <Field
          label={labels.emailLabel}
          type="email"
          name="email"
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (touched.email) setErrors((p) => ({ ...p, email: emailError(e.target.value) }));
          }}
          onBlur={() => {
            setTouched((p) => ({ ...p, email: true }));
            setErrors((p) => ({ ...p, email: emailError(email) }));
          }}
          error={errors.email}
        />

        {mode !== 'reset' && (
          <div>
            <Field
              label={labels.passwordLabel}
              type="password"
              name="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              reveal={{ show: labels.password.show, hide: labels.password.hide }}
              onChange={(e) => {
                setPassword(e.target.value);
                if (touched.password)
                  setErrors((p) => ({ ...p, password: passwordError(e.target.value) }));
              }}
              onBlur={() => {
                setTouched((p) => ({ ...p, password: true }));
                setErrors((p) => ({ ...p, password: passwordError(password) }));
              }}
              error={errors.password}
            />

            {/* Signup only. On sign-in the password already exists; rating it
                then is noise, and it would rate the one they are typing in. */}
            {mode === 'signup' && (
              <PasswordMeter
                password={password}
                labels={{
                  strength: labels.password.strength,
                  levels: labels.password.levels,
                  rules: labels.password.rules,
                }}
              />
            )}

            {mode === 'signin' && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-xs text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
                >
                  {labels.forgot}
                </button>
              </div>
            )}
          </div>
        )}

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
          {submitLabel}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {mode === 'reset' ? (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
          >
            {labels.backToSignIn}
          </button>
        ) : (
          <>
            {mode === 'signin' ? labels.noAccount : labels.hasAccount}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
            >
              {mode === 'signin' ? labels.signUp : labels.signIn}
            </button>
          </>
        )}
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

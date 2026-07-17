'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  confirmLabel: string;
  signIn: string;
  signUp: string;
  terms: { agree: string; termsLink: string; privacyLink: string };
  noAccount: string;
  hasAccount: string;
  or: string;
  checkEmail: string;
  forgot: string;
  backToSignIn: string;
  resetBody: string;
  resetSubmit: string;
  resetSent: string;
  resend: { action: string; sent: string };
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
    notConfirmed: string;
    rateLimit: string;
    exists: string;
    nameRequired: string;
    termsRequired: string;
    confirmRequired: string;
    confirmMismatch: string;
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirm?: string;
    terms?: string;
    form?: string;
  }>(initialError ? { form: labels.errors.generic } : {});
  const [touched, setTouched] = useState<{
    name?: boolean;
    email?: boolean;
    password?: boolean;
    confirm?: boolean;
  }>({});
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Set when the account exists and the password was right, but the address was
  // never confirmed. Without this the only offer is "try again", which cannot work.
  const [needsConfirm, setNeedsConfirm] = useState(false);

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

  function nameError(value: string) {
    if (mode === 'signup' && !value.trim()) return labels.errors.nameRequired;
    return undefined;
  }

  /** Compared against the password you cannot see — a typo here is the whole point. */
  function confirmError(value: string, against = password) {
    if (mode !== 'signup') return undefined;
    if (!value) return labels.errors.confirmRequired;
    if (value !== against) return labels.errors.confirmMismatch;
    return undefined;
  }

  function validate() {
    const found: typeof errors = { email: emailError(email) };
    if (mode !== 'reset') found.password = passwordError(password);
    if (mode === 'signup') {
      found.name = nameError(name);
      found.confirm = confirmError(confirm);
      if (!agreed) found.terms = labels.errors.termsRequired;
    }

    setErrors(found);
    setTouched({ name: true, email: true, password: true, confirm: true });
    return !found.email && !found.password && !found.name && !found.confirm && !found.terms;
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setErrors({});
    setTouched({});
    setNotice(undefined);
    setNeedsConfirm(false);
  }

  /**
   * Supabase distinguishes these; collapsing them into "wrong password" tells
   * someone whose credentials are correct to keep retrying credentials that
   * already work. email_not_confirmed in particular is a dead end without the
   * resend offer — the account exists, the password matched, and no amount of
   * retyping will help.
   *
   * Codes are from AuthApiError.code; the message string is not matched on,
   * because that is prose and changes.
   */
  function describe(error: { code?: string; message: string }): string {
    switch (error.code) {
      case 'email_not_confirmed':
        return labels.errors.notConfirmed;
      case 'invalid_credentials':
        return labels.errors.invalid;
      case 'user_already_exists':
      case 'email_exists':
        return labels.errors.exists;
      case 'weak_password':
        return labels.errors.passwordShort;
      case 'email_address_invalid':
        return labels.errors.emailInvalid;
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return labels.errors.rateLimit;
      default:
        // Log the real one — the user gets prose, we get the code.
        console.error('auth failed:', error.code ?? '(no code)', error.message);
        return mode === 'signin' ? labels.errors.invalid : labels.errors.generic;
    }
  }

  async function resendConfirmation() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setBusy(false);
    if (error) {
      setErrors({ form: describe(error) });
      return;
    }
    setNeedsConfirm(false);
    setErrors({});
    setNotice(labels.resend.sent);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(undefined);
    if (!validate()) return;

    setBusy(true);
    setNeedsConfirm(false);
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
            options: {
              emailRedirectTo: callback(next ?? `/${lang}/home`),
              // Lands in raw_user_meta_data, which the handle_new_user trigger
              // already copies into profiles.full_name — it was only ever
              // populated for Google users, so email signups were greeted by the
              // part of their address before the @.
              data: { full_name: name.trim() },
            },
          });

    setBusy(false);

    if (result.error) {
      setErrors({ form: describe(result.error) });
      setNeedsConfirm(result.error.code === 'email_not_confirmed');
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
          {/* Segmented switch. Plain buttons with aria-pressed rather than the
              ARIA tab pattern: tabs promise arrow-key navigation between tabs and
              a labelled tabpanel, and claiming that without implementing it is
              worse for a screen reader than not claiming it. */}
          <div
            role="group"
            aria-label={labels.signIn + ' / ' + labels.signUp}
            className="mb-6 flex rounded-md border border-rule bg-paper-sunken p-1"
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  'flex-1 rounded-sm px-4 py-1.5 text-sm font-medium transition-colors',
                  mode === m
                    ? 'bg-paper-raised text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {m === 'signin' ? labels.signIn : labels.signUp}
              </button>
            ))}
          </div>

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
        {mode === 'signup' && (
          <Field
            label={labels.nameLabel}
            type="text"
            name="name"
            autoComplete="name"
            placeholder={labels.namePlaceholder}
            icon={<UserIcon />}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (touched.name) setErrors((p) => ({ ...p, name: nameError(e.target.value) }));
            }}
            onBlur={() => {
              setTouched((p) => ({ ...p, name: true }));
              setErrors((p) => ({ ...p, name: nameError(name) }));
            }}
            error={errors.name}
          />
        )}

        <Field
          label={labels.emailLabel}
          type="email"
          name="email"
          autoComplete="email"
          placeholder={labels.emailPlaceholder}
          icon={<MailIcon />}
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
              icon={<LockIcon />}
              reveal={{ show: labels.password.show, hide: labels.password.hide }}
              onChange={(e) => {
                setPassword(e.target.value);
                if (touched.password)
                  setErrors((p) => ({ ...p, password: passwordError(e.target.value) }));
                // Editing the password after confirming it can un-match the pair,
                // so re-check the confirm field against the new value rather than
                // leaving a stale "they match" behind.
                if (touched.confirm)
                  setErrors((p) => ({ ...p, confirm: confirmError(confirm, e.target.value) }));
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

        {/* Catches a typo in a field you cannot read back. The reveal toggle helps
            but is opt-in — and a mistyped password is only discovered later, at
            sign-in, by which point it is a support problem rather than a form one. */}
        {mode === 'signup' && (
          <Field
            label={labels.confirmLabel}
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            icon={<LockIcon />}
            reveal={{ show: labels.password.show, hide: labels.password.hide }}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (touched.confirm)
                setErrors((p) => ({ ...p, confirm: confirmError(e.target.value) }));
            }}
            onBlur={() => {
              setTouched((p) => ({ ...p, confirm: true }));
              setErrors((p) => ({ ...p, confirm: confirmError(confirm) }));
            }}
            error={errors.confirm}
          />
        )}

        {mode === 'signup' && (
          <div>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  if (e.target.checked) setErrors((p) => ({ ...p, terms: undefined }));
                }}
                aria-describedby={errors.terms ? 'terms-error' : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              {/* Split on the placeholders rather than concatenating fragments:
                  Arabic puts the links in a different order, and gluing
                  "I agree to the" + link + "and" + link hard-codes English syntax. */}
              <span className="text-xs text-ink-muted">
                {labels.terms.agree.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
                  part === '{terms}' ? (
                    <Link
                      key={i}
                      href={`/${lang}/terms`}
                      className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                    >
                      {labels.terms.termsLink}
                    </Link>
                  ) : part === '{privacy}' ? (
                    <Link
                      key={i}
                      href={`/${lang}/privacy`}
                      className="text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent"
                    >
                      {labels.terms.privacyLink}
                    </Link>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </span>
            </label>
            {errors.terms && (
              <p id="terms-error" role="alert" className="mt-1 text-xs text-danger">
                {errors.terms}
              </p>
            )}
          </div>
        )}

        {errors.form && (
          <div role="alert" className="rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">
            <p>{errors.form}</p>
            {needsConfirm && (
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={busy}
                className="mt-1 underline underline-offset-2 hover:no-underline disabled:opacity-50"
              >
                {labels.resend.action}
              </button>
            )}
          </div>
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

/**
 * Inline rather than an icon package: three glyphs at ~12 lines each do not
 * justify lucide-react, which the rebuild removed. All aria-hidden — each one
 * sits beside a real <label> that already names the field.
 */
function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function UserIcon() {
  return (
    <FieldIcon>
      <circle cx="10" cy="6.5" r="3" />
      <path d="M3.5 16.5a6.5 6.5 0 0 1 13 0" />
    </FieldIcon>
  );
}

function MailIcon() {
  return (
    <FieldIcon>
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" />
      <path d="m3 6 7 5 7-5" />
    </FieldIcon>
  );
}

function LockIcon() {
  return (
    <FieldIcon>
      <rect x="4" y="8.5" width="12" height="8" rx="1.5" />
      <path d="M6.75 8.5V6a3.25 3.25 0 0 1 6.5 0v2.5" />
    </FieldIcon>
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

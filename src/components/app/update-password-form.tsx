'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PasswordMeter } from '@/components/ui/password-meter';
import { passwordStrength, type PasswordRule, type StrengthLevel } from '@/lib/password';
import type { Locale } from '@/lib/i18n';

/**
 * Second half of the reset: the recovery link put a session in place, so this
 * just changes the password on it. Supabase requires no old password here —
 * possession of the emailed link is the proof, which is why the link is
 * single-use and short-lived.
 */
export function UpdatePasswordForm({
  lang,
  labels,
}: {
  lang: Locale;
  labels: {
    newPassword: string;
    submit: string;
    done: string;
    expired: string;
    generic: string;
    passwordShort: string;
    password: {
      show: string;
      hide: string;
      strength: string;
      levels: Record<StrengthLevel, string>;
      rules: Record<PasswordRule, string>;
    };
  };
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordStrength(password).acceptable) {
      setError(labels.passwordShort);
      return;
    }

    setBusy(true);
    setFormError(undefined);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      // The usual cause is an expired or already-used recovery link: without a
      // session there is nobody to update.
      setFormError(
        /session|jwt|expired/i.test(updateError.message) ? labels.expired : labels.generic
      );
      return;
    }

    setDone(true);
    router.refresh();
    setTimeout(() => router.push(`/${lang}/home`), 1200);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-4">
      <div>
        <Field
          label={labels.newPassword}
          type="password"
          name="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          reveal={{ show: labels.password.show, hide: labels.password.hide }}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(undefined);
          }}
          error={error}
          disabled={done}
        />
        <PasswordMeter
          password={password}
          labels={{
            strength: labels.password.strength,
            levels: labels.password.levels,
            rules: labels.password.rules,
          }}
        />
      </div>

      {formError && (
        <p role="alert" className="rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      {done && (
        <p role="status" className="rounded-sm bg-accent-wash px-3 py-2 text-sm text-accent">
          {labels.done}
        </p>
      )}

      <Button type="submit" size="lg" disabled={busy || done} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}

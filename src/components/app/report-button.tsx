'use client';

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { reportCertification, type ReportResult } from '@/app/[lang]/(app)/certification/[id]/actions';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';
import type { ReportField } from '@/lib/types';

const FIELDS: ReportField[] = [
  'exam_cost',
  'study_hours',
  'exam_details',
  'prerequisites',
  'url',
  'other',
];

/**
 * Lets a signed-in user say a fact on this page is wrong.
 *
 * Native <dialog> rather than a modal library or a hand-rolled overlay: focus
 * trapping, Esc to close, the backdrop, inert-ing the page behind it and
 * returning focus on close are all built in and all things a hand-rolled one
 * gets wrong.
 */
export function ReportButton({
  certId,
  lang,
  signedIn,
  labels,
}: {
  certId: string;
  lang: Locale;
  signedIn: boolean;
  labels: {
    open: string;
    title: string;
    body: string;
    fieldLabel: string;
    fields: Record<ReportField, string>;
    messageLabel: string;
    messagePlaceholder: string;
    submit: string;
    sending: string;
    thanks: string;
    signIn: string;
    error: string;
    cancel: string;
  };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<ReportResult | null, FormData>(
    (_prev, formData) => reportCertification(formData),
    null
  );

  // Close on success, but only after the thanks message has been rendered long
  // enough to read.
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => dialogRef.current?.close(), 1600);
      return () => clearTimeout(t);
    }
  }, [state]);

  const triggerClass =
    'text-xs text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink';

  // Send them to sign in before they write anything. Reporting needs an account
  // (the insert policy is auth.uid() = user_id), and React resets the form when
  // the action returns — so letting someone type a correction first and only
  // then telling them to sign in throws their words away and asks them to
  // rewrite it, at the exact moment they were doing us a favour.
  if (!signedIn) {
    return (
      <Link
        href={`/${lang}/auth?next=/${lang}/certification/${certId}`}
        className={triggerClass}
      >
        {labels.open}
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={triggerClass}>
        {labels.open}
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-rule bg-paper p-0 text-ink backdrop:bg-ink/30"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{labels.body}</p>
          </div>

          <input type="hidden" name="certId" value={certId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-field" className="text-sm font-medium text-ink">
              {labels.fieldLabel}
            </label>
            <select
              id="report-field"
              name="field"
              required
              defaultValue="exam_cost"
              className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
            >
              {FIELDS.map((f) => (
                <option key={f} value={f}>
                  {labels.fields[f]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="report-message" className="text-sm font-medium text-ink">
              {labels.messageLabel}
            </label>
            <textarea
              id="report-message"
              name="message"
              required
              rows={4}
              maxLength={1000}
              placeholder={labels.messagePlaceholder}
              className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
            />
          </div>

          {state?.ok === false && (
            <p role="alert" className="text-xs text-danger">
              {state.error === 'auth' ? (
                <Link
                  href={`/${lang}/auth?next=/${lang}/certification/${certId}`}
                  className="underline underline-offset-2"
                >
                  {labels.signIn}
                </Link>
              ) : (
                labels.error
              )}
            </p>
          )}

          {state?.ok && (
            <p role="status" className="text-xs text-accent">
              {labels.thanks}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => dialogRef.current?.close()}
            >
              {labels.cancel}
            </Button>
            <Button type="submit" size="md" disabled={pending || state?.ok}>
              {pending ? labels.sending : labels.submit}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

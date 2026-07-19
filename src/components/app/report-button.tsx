'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { reportCertification } from '@/app/[lang]/(app)/certification/[id]/actions';
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

const MAX = 1000;

/**
 * Lets a signed-in user say a fact on this page is wrong.
 *
 * Same shape as the "Report a problem" dialog: a live character counter and a
 * confirmation screen the user dismisses themselves — no timed auto-close.
 * Submission state is local (not useActionState) so it resets on close instead
 * of surviving into the next open, which left the submit button stuck disabled.
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
    charCount: string;
    submit: string;
    sending: string;
    sentTitle: string;
    sentBody: string;
    close: string;
    signIn: string;
    error: string;
    cancel: string;
  };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [field, setField] = useState<ReportField>('exam_cost');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'form' | 'sending' | 'sent'>('form');
  const [errored, setErrored] = useState<false | 'auth' | 'other'>(false);

  const triggerClass =
    'text-xs text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink';

  // Send them to sign in before they write anything. Reporting needs an account
  // (the insert policy is auth.uid() = user_id) — letting someone type a
  // correction first and only then telling them to sign in throws their words
  // away at the exact moment they were doing us a favour.
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || phase === 'sending') return;
    setErrored(false);
    setPhase('sending');
    const fd = new FormData();
    fd.set('certId', certId);
    fd.set('field', field);
    fd.set('message', message.trim());
    const res = await reportCertification(fd);
    if (res.ok) {
      setPhase('sent');
    } else {
      setErrored(res.error === 'auth' ? 'auth' : 'other');
      setPhase('form');
    }
  }

  // Reset everything on close, so reopening starts fresh.
  function handleClose() {
    setField('exam_cost');
    setMessage('');
    setPhase('form');
    setErrored(false);
    dialogRef.current?.close();
  }

  const atLimit = message.length >= MAX;

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className={triggerClass}>
        {labels.open}
      </button>

      <dialog
        ref={dialogRef}
        onClose={handleClose}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-rule bg-paper p-0 text-ink backdrop:bg-ink/30"
      >
        {phase === 'sent' ? (
          // The confirmation "mini screen" — replaces the form and waits for Close.
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-wash text-accent">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display text-lg font-semibold text-ink">{labels.sentTitle}</h2>
            <p className="text-sm text-ink-muted">{labels.sentBody}</p>
            <Button type="button" size="md" onClick={handleClose} className="mt-2">
              {labels.close}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{labels.body}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-field" className="text-sm font-medium text-ink">
                {labels.fieldLabel}
              </label>
              <select
                id="report-field"
                name="field"
                value={field}
                onChange={(e) => setField(e.target.value as ReportField)}
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
                maxLength={MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={labels.messagePlaceholder}
                className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
              />
              <span
                title={labels.charCount}
                className={`tabular self-end text-xs ${atLimit ? 'text-danger' : 'text-ink-faint'}`}
              >
                {message.length}/{MAX}
              </span>
            </div>

            {errored && (
              <p role="alert" className="text-xs text-danger">
                {errored === 'auth' ? (
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

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="md" onClick={handleClose}>
                {labels.cancel}
              </Button>
              <Button type="submit" size="md" disabled={phase === 'sending' || !message.trim()}>
                {phase === 'sending' ? labels.sending : labels.submit}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

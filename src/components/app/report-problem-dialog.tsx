'use client';

import { useEffect, useRef, useState } from 'react';
import { reportProblem } from '@/app/[lang]/(app)/report-actions';
import { Button } from '@/components/ui/button';

const CATEGORIES = ['bug', 'content', 'idea', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

const MAX = 200;

/** Shared so AppNav/AccountMenu describe the labels once, not three times. */
export type ReportDialogLabels = {
  title: string;
  body: string;
  categoryLabel: string;
  categories: Record<Category, string>;
  messageLabel: string;
  /** One per category — the prompt changes with the kind of problem picked. */
  placeholders: Record<Category, string>;
  charCount: string;
  submit: string;
  sending: string;
  sentTitle: string;
  sentBody: string;
  close: string;
  error: string;
  cancel: string;
};

/**
 * "Report a problem", opened from the account menu. Modelled on the certification
 * report: a "What's wrong?" picker whose choice drives the message placeholder,
 * plus a live character counter. On success it swaps to a confirmation screen the
 * user dismisses themselves — no timed auto-close.
 *
 * Controlled by the menu (open/onClose) so the native <dialog> can stay mounted
 * while the dropdown closes. Submission state is local (not useActionState) so it
 * resets cleanly on close instead of surviving into the next open.
 */
export function ReportProblemDialog({
  open,
  onClose,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  labels: ReportDialogLabels;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'form' | 'sending' | 'sent'>('form');
  const [errored, setErrored] = useState(false);

  // Mirror the controlled `open` onto the native dialog.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || phase === 'sending') return;
    setErrored(false);
    setPhase('sending');
    const fd = new FormData();
    fd.set('category', category);
    fd.set('message', message.trim());
    const res = await reportProblem(fd);
    if (res.ok) {
      setPhase('sent');
    } else {
      setErrored(true);
      setPhase('form');
    }
  }

  // Reset everything on close, so reopening starts fresh.
  function handleClose() {
    setCategory('bug');
    setMessage('');
    setPhase('form');
    setErrored(false);
    onClose();
  }

  const atLimit = message.length >= MAX;

  return (
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
            <label htmlFor="report-category" className="text-sm font-medium text-ink">
              {labels.categoryLabel}
            </label>
            <select
              id="report-category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {labels.categories[c]}
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
              placeholder={labels.placeholders[category]}
              className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
            />
            <span
              title={labels.charCount}
              className={`tabular self-end text-xs ${atLimit ? 'text-danger' : 'text-ink-faint'}`}
            >
              {message.length}/{MAX}
            </span>
          </div>

          {errored && <p role="alert" className="text-xs text-danger">{labels.error}</p>}

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
  );
}

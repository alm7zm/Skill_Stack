'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { reportProblem, type ReportProblemResult } from '@/app/[lang]/(app)/report-actions';
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
  thanks: string;
  error: string;
  cancel: string;
};

/**
 * "Report a problem", opened from the account menu. Modelled on the certification
 * report: a "What's wrong?" picker whose choice drives the message placeholder,
 * plus a live character counter. Controlled by the menu (open/onClose) so the
 * native <dialog> can stay mounted while the dropdown closes.
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
  const [state, formAction, pending] = useActionState<ReportProblemResult | null, FormData>(
    (_prev, formData) => reportProblem(formData),
    null
  );

  // Mirror the controlled `open` onto the native dialog.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // Close shortly after the thanks message has had time to read.
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onClose, 1600);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  // Reset the form when it closes, so reopening starts fresh.
  function handleClose() {
    setCategory('bug');
    setMessage('');
    onClose();
  }

  const atLimit = message.length >= MAX;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-rule bg-paper p-0 text-ink backdrop:bg-ink/30"
    >
      <form action={formAction} className="flex flex-col gap-4 p-5">
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

        {state?.ok === false && <p role="alert" className="text-xs text-danger">{labels.error}</p>}
        {state?.ok && <p role="status" className="text-xs text-accent">{labels.thanks}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={handleClose}>
            {labels.cancel}
          </Button>
          <Button type="submit" size="md" disabled={pending || state?.ok || !message.trim()}>
            {pending ? labels.sending : labels.submit}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

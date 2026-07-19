'use client';

import { useActionState, useEffect, useRef } from 'react';
import { reportProblem, type ReportProblemResult } from '@/app/[lang]/(app)/report-actions';
import { Button } from '@/components/ui/button';

/**
 * "Report a problem", opened from the account menu. Controlled by the menu
 * (open/onClose) so the dialog can stay mounted while the dropdown closes —
 * a native <dialog> for focus trap, Esc, and backdrop for free.
 */
export function ReportProblemDialog({
  open,
  onClose,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  labels: {
    title: string;
    body: string;
    label: string;
    placeholder: string;
    hint: string;
    submit: string;
    sending: string;
    thanks: string;
    error: string;
    cancel: string;
  };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-rule bg-paper p-0 text-ink backdrop:bg-ink/30"
    >
      <form action={formAction} className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{labels.body}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-problem-message" className="text-sm font-medium text-ink">
            {labels.label}
          </label>
          <textarea
            id="report-problem-message"
            name="message"
            required
            rows={4}
            maxLength={200}
            placeholder={labels.placeholder}
            className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
          />
          <p className="text-xs text-ink-faint">{labels.hint}</p>
        </div>

        {state?.ok === false && <p role="alert" className="text-xs text-danger">{labels.error}</p>}
        {state?.ok && <p role="status" className="text-xs text-accent">{labels.thanks}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button type="submit" size="md" disabled={pending || state?.ok}>
            {pending ? labels.sending : labels.submit}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

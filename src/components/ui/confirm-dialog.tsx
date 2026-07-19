'use client';

import { Button } from '@/components/ui/button';

/** A small modal used to gate a destructive or lossy action (discard edits, delete a plan). */
export function ConfirmDialog({
  labels,
  onKeep,
  onDiscard,
}: {
  labels: { title: string; body: string; discard: string; keep: string };
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg border border-rule bg-paper-raised p-6 shadow-float">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{labels.body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onKeep}>{labels.keep}</Button>
          <Button type="button" onClick={onDiscard}>{labels.discard}</Button>
        </div>
      </div>
    </div>
  );
}

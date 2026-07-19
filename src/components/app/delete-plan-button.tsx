'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deletePlan } from '@/app/[lang]/(app)/plan/actions';
import type { Locale } from '@/lib/i18n';

/**
 * Delete lives on the plan view page, next to Edit — a destructive action that
 * belongs with "view", not buried inside the editor. Client-side only for the
 * confirm gate; the delete itself is the server action, scoped by RLS.
 */
export function DeletePlanButton({
  lang,
  planId,
  labels,
}: {
  lang: Locale;
  planId: string;
  labels: { delete: string; cancel: string; confirm: { title: string; body: string; confirm: string } };
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger-wash hover:text-danger"
        onClick={() => setOpen(true)}
      >
        {labels.delete}
      </Button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {open && (
        <ConfirmDialog
          labels={{ title: labels.confirm.title, body: labels.confirm.body, discard: labels.confirm.confirm, keep: labels.cancel }}
          onKeep={() => setOpen(false)}
          onDiscard={async () => {
            const res = await deletePlan({ lang, planId });
            if (res && 'error' in res) {
              setError(res.error);
              setOpen(false);
            }
          }}
        />
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScheduleGrid, type ScheduleWindows } from '@/components/app/schedule-grid';
import type { StudySchedule } from '@/lib/calendar/schedule';
import type { Locale } from '@/lib/i18n';

/**
 * The profile's "Preferred studying schedule": the shared ScheduleGrid plus a
 * Save. Timezone is the browser's, detected — the user is in one place; moving
 * and re-saving updates it.
 */
export function StudyScheduleForm({
  lang,
  initial,
  action,
  labels,
}: {
  lang: Locale;
  initial: StudySchedule | null;
  action: (formData: FormData) => Promise<void>;
  labels: { from: string; to: string; timezoneNote: string; save: string };
}) {
  const [windows, setWindows] = useState<ScheduleWindows>(() =>
    Object.fromEntries((initial?.windows ?? []).map((w) => [w.day, { start: w.start, end: w.end }]))
  );
  const [timezone] = useState(
    () => initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  );

  const entries = Object.entries(windows).map(([d, w]) => ({ day: Number(d), ...w }));
  // Save is blocked until every chosen window is a positive span.
  const valid = entries.length > 0 && entries.every((e) => e.end > e.start);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="windows" value={JSON.stringify(entries)} />
      <input type="hidden" name="timezone" value={timezone} />

      <ScheduleGrid
        lang={lang}
        windows={windows}
        onChange={setWindows}
        timezone={timezone}
        labels={{ from: labels.from, to: labels.to, timezoneNote: labels.timezoneNote }}
      />

      <Button type="submit" className="self-start" disabled={!valid}>
        {labels.save}
      </Button>
    </form>
  );
}

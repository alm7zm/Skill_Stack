'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { StudySchedule } from '@/lib/calendar/schedule';
import type { Locale } from '@/lib/i18n';

type Window = { start: string; end: string };

/**
 * Set a study schedule — a time window per weekday, in the browser's timezone
 * (detected, not picked — the user is in one place; moving and re-saving updates
 * it). Topics pack into each day's window in order.
 *
 * The same UI in two places: the profile saves the preferred schedule, and Edit
 * plan saves a per-plan override. `action` is the server action to post to;
 * `planId` (when saving a plan) rides along as a hidden field.
 */
export function StudyScheduleForm({
  lang,
  initial,
  action,
  planId,
  labels,
}: {
  lang: Locale;
  initial: StudySchedule | null;
  action: (formData: FormData) => Promise<void>;
  planId?: string;
  labels: {
    from: string;
    to: string;
    timezoneNote: string;
    save: string;
    ask: { placeholder: string; button: string; asking: string; error: string };
  };
}) {
  // weekday (0=Sun..6=Sat) -> window, only for days the user studies.
  const [windows, setWindows] = useState<Record<number, Window>>(() =>
    Object.fromEntries((initial?.windows ?? []).map((w) => [w.day, { start: w.start, end: w.end }]))
  );
  const [timezone] = useState(
    () => initial?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  );
  const [ask, setAsk] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(false);

  async function onAsk() {
    const text = ask.trim();
    if (!text || asking) return;
    setAskError(false);
    setAsking(true);
    try {
      const res = await fetch('/api/advisor/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction: text, locale: lang }),
      });
      if (!res.ok) throw new Error();
      const { windows: parsed } = (await res.json()) as {
        windows: { day: number; start: string; end: string }[];
      };
      // Replace the grid with what the advisor understood; the user tweaks + saves.
      setWindows(Object.fromEntries(parsed.map((w) => [w.day, { start: w.start, end: w.end }])));
    } catch {
      setAskError(true);
    } finally {
      setAsking(false);
    }
  }

  // Localized long weekday names, 0=Sun..6=Sat — Jan 1 2023 was a Sunday.
  const dayNames = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2023, 0, 1 + d))
    )
  );

  const toggle = (d: number) =>
    setWindows((cur) => {
      const next = { ...cur };
      if (next[d]) delete next[d];
      else next[d] = { start: '19:00', end: '21:00' };
      return next;
    });

  const setField = (d: number, field: keyof Window, value: string) =>
    setWindows((cur) => ({ ...cur, [d]: { ...cur[d], [field]: value } }));

  const entries = Object.entries(windows).map(([d, w]) => ({ day: Number(d), ...w }));
  // Save is blocked until every chosen window is a positive span.
  const valid = entries.length > 0 && entries.every((e) => e.end > e.start);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="windows" value={JSON.stringify(entries)} />
      <input type="hidden" name="timezone" value={timezone} />
      {planId && <input type="hidden" name="planId" value={planId} />}

      {/* Describe availability in words; the advisor fills the grid below. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onAsk();
            }
          }}
          placeholder={labels.ask.placeholder}
          disabled={asking}
          maxLength={200}
          className="h-10 min-w-56 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint"
        />
        <Button type="button" variant="secondary" onClick={() => void onAsk()} disabled={asking || !ask.trim()}>
          {asking ? labels.ask.asking : labels.ask.button}
        </Button>
      </div>
      {askError && <p role="alert" className="text-xs text-danger">{labels.ask.error}</p>}

      <div className="flex flex-col divide-y divide-rule/60 rounded-md border border-rule">
        {dayNames.map((name, d) => {
          const on = !!windows[d];
          return (
            <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                onClick={() => toggle(d)}
                aria-pressed={on}
                className={`h-8 min-w-28 rounded-md border px-3 text-start text-sm font-medium transition-colors ${
                  on
                    ? 'border-accent bg-accent text-paper'
                    : 'border-rule bg-paper-raised text-ink-muted hover:border-rule-strong'
                }`}
              >
                {name}
              </button>

              {on && (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="time"
                    aria-label={`${name} — ${labels.from}`}
                    value={windows[d].start}
                    onChange={(e) => setField(d, 'start', e.target.value)}
                    className="h-8 rounded-md border border-rule bg-paper-raised px-2 text-sm text-ink hover:border-rule-strong"
                  />
                  <span className="text-ink-faint">{labels.to}</span>
                  <input
                    type="time"
                    aria-label={`${name} — ${labels.to}`}
                    value={windows[d].end}
                    onChange={(e) => setField(d, 'end', e.target.value)}
                    className={`h-8 rounded-md border bg-paper-raised px-2 text-sm text-ink hover:border-rule-strong ${
                      windows[d].end > windows[d].start ? 'border-rule' : 'border-danger'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-faint">{labels.timezoneNote.replace('{tz}', timezone)}</p>

      <Button type="submit" className="self-start" disabled={!valid}>
        {labels.save}
      </Button>
    </form>
  );
}

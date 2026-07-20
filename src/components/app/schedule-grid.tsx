'use client';

import type { Locale } from '@/lib/i18n';

export type ScheduleWindows = Record<number, { start: string; end: string }>;

/**
 * The presentational per-weekday window grid — toggles + From/to time inputs +
 * the timezone note. Controlled: the parent owns `windows` and the timezone.
 *
 * Shared by the profile's StudyScheduleForm (which adds the advisor input and a
 * Save) and the plan editor (which saves it with the plan's single Save). No form,
 * no save button, no advisor here — those belong to whoever embeds it.
 */
export function ScheduleGrid({
  lang,
  windows,
  onChange,
  timezone,
  labels,
}: {
  lang: Locale;
  windows: ScheduleWindows;
  onChange: (next: ScheduleWindows) => void;
  timezone: string;
  labels: { from: string; to: string; timezoneNote: string };
}) {
  // Localized long weekday names, 0=Sun..6=Sat — Jan 1 2023 was a Sunday.
  const dayNames = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(lang, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2023, 0, 1 + d))
    )
  );

  const toggle = (d: number) => {
    const next = { ...windows };
    if (next[d]) delete next[d];
    else next[d] = { start: '19:00', end: '21:00' };
    onChange(next);
  };

  const setField = (d: number, field: 'start' | 'end', value: string) =>
    onChange({ ...windows, [d]: { ...windows[d], [field]: value } });

  return (
    <div className="flex flex-col gap-3">
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
    </div>
  );
}

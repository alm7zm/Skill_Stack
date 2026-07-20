/**
 * A user's study schedule: a time window per weekday, plus a timezone. Stored as
 * one jsonb column (profiles.study_schedule), mirroring advisor_settings.
 *
 * The plan page and the calendar sync both derive concrete study slots from this
 * — topics are packed into each day's window back-to-back, in order — so the two
 * always agree on when to study.
 *
 * All times are wall-clock local: 'HH:MM' plus an IANA timezone. Google Calendar
 * resolves the real instant (DST included) from the timezone, and the plan page
 * shows exactly the wall-clock the user set. No offset math here.
 */

/** A study window on one weekday. `day` is 0=Sunday..6=Saturday (JS getDay). */
export type DayWindow = { day: number; start: string; end: string };

export type StudySchedule = {
  windows: DayWindow[];
  /** IANA zone, e.g. 'Asia/Riyadh'. */
  timezone: string;
};

/** A fallback for syncing before a schedule is set: 18:00–21:00 every day, UTC. */
export const DEFAULT_SCHEDULE: StudySchedule = {
  windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '18:00', end: '21:00' })),
  timezone: 'UTC',
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * Coerce the jsonb column into a valid schedule, or null if it isn't a complete
 * one — null means "not set", which the UI treats as feature-off. Each window
 * must be a positive, same-day span; one window per weekday.
 */
export function normalizeStudySchedule(raw: unknown): StudySchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const seen = new Set<number>();
  const windows: DayWindow[] = [];
  if (Array.isArray(r.windows)) {
    for (const w of r.windows) {
      if (!w || typeof w !== 'object') continue;
      const o = w as Record<string, unknown>;
      const { day, start, end } = o;
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) continue;
      if (typeof start !== 'string' || !HHMM.test(start)) continue;
      if (typeof end !== 'string' || !HHMM.test(end)) continue;
      if (toMin(end) <= toMin(start)) continue; // positive, same-day (no overnight)
      if (seen.has(day)) continue; // one window per weekday
      seen.add(day);
      windows.push({ day, start, end });
    }
  }

  const timezone =
    typeof r.timezone === 'string' && r.timezone.length > 0 && r.timezone.length < 64
      ? r.timezone
      : null;

  if (windows.length === 0 || !timezone) return null;
  windows.sort((a, b) => a.day - b.day);
  return { windows, timezone };
}

// --- pure calendar-date helpers (YYYY-MM-DD strings, timezone-agnostic) -------

/** YYYY-MM-DD of `n` days after `ymd`. Noon-UTC anchor dodges DST edges. */
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0=Sun..6=Sat for a calendar date. */
function weekday(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

/** Add `hours` to a wall-clock time on a date, rolling the date across midnight. */
function shift(ymd: string, time: string, hours: number): { date: string; time: string } {
  const [Y, Mo, D] = ymd.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  // Treat the wall clock as UTC purely for component arithmetic — only the
  // resulting Y/M/D/H/M are read back, never the instant, so the timezone is
  // irrelevant here and midnight rollover stays correct.
  const d = new Date(Date.UTC(Y, Mo - 1, D, h, m) + hours * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

export type Slot = {
  date: string; // YYYY-MM-DD, session start
  startTime: string; // HH:MM
  endDate: string; // YYYY-MM-DD, may roll past midnight
  endTime: string; // HH:MM
  timezone: string;
};

/** Today's date (YYYY-MM-DD) in a given timezone. */
export function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * One slot per topic, packed into each day's window back-to-back, in order,
 * starting the day after `fromYmd`. `hoursPerTopic[i]` sets slot i's length
 * (min 30 min). A topic bigger than a whole window is still placed alone (it
 * overflows the end) rather than stalling the schedule.
 *
 * ponytail: greedy first-fit, no look-ahead to balance days. Good enough for a
 * study plan; revisit if users want topics spread evenly.
 */
export function buildSlots(schedule: StudySchedule, fromYmd: string, hoursPerTopic: number[]): Slot[] {
  const byDay = new Map(schedule.windows.map((w) => [w.day, w]));
  const slots: Slot[] = [];
  let ti = 0;
  let cur = fromYmd;
  const cap = hoursPerTopic.length * 7 + 14; // ≥1 topic placed per study day, so this suffices
  for (let i = 0; ti < hoursPerTopic.length && i < cap; i++) {
    cur = addDays(cur, 1);
    const w = byDay.get(weekday(cur));
    if (!w) continue;

    const capacity = (toMin(w.end) - toMin(w.start)) / 60; // hours
    let offset = 0;
    let placedToday = 0;
    while (ti < hoursPerTopic.length) {
      const dur = Math.max(0.5, hoursPerTopic[ti] || 0);
      // Stop for the day once the next topic won't fit — unless nothing has been
      // placed yet, in which case an oversized topic goes in anyway.
      if (placedToday > 0 && offset + dur > capacity) break;
      const s = shift(cur, w.start, offset);
      const e = shift(cur, w.start, offset + dur);
      slots.push({
        date: s.date,
        startTime: s.time,
        endDate: e.date,
        endTime: e.time,
        timezone: schedule.timezone,
      });
      offset += dur;
      placedToday += 1;
      ti += 1;
    }
  }
  return slots;
}

/** Google Calendar event time: a local wall-clock dateTime plus its IANA zone. */
export function eventTimes(slot: Slot): {
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
} {
  return {
    start: { dateTime: `${slot.date}T${slot.startTime}:00`, timeZone: slot.timezone },
    end: { dateTime: `${slot.endDate}T${slot.endTime}:00`, timeZone: slot.timezone },
  };
}

/**
 * Human label for a slot, e.g. "Mon, Jul 21 · 7:00 – 9:00 PM", localized. The
 * wall-clock components are formatted as-is (anchored to UTC only so Intl reads
 * back what we pass), so the display matches the time the user set exactly.
 */
export function formatSlot(slot: Slot, locale: string): string {
  const at = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00Z`);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(at(slot.date, slot.startTime));
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${day} · ${time.format(at(slot.date, slot.startTime))} – ${time.format(at(slot.endDate, slot.endTime))}`;
}

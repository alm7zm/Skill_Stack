import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudySchedule, buildSlots, todayIn, type StudySchedule } from './schedule.ts';

const wd = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();
const nextDow = (from: string, dow: number) => {
  let d = from;
  while (wd(d) !== dow) d = new Date(new Date(`${d}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  return d;
};

test('normalizeStudySchedule rejects incomplete schedules', () => {
  assert.equal(normalizeStudySchedule(null), null);
  assert.equal(normalizeStudySchedule({ windows: [], timezone: 'UTC' }), null);
  assert.equal(normalizeStudySchedule({ windows: [{ day: 0, start: '12:00', end: '17:00' }] }), null);
  // end must be after start
  assert.equal(
    normalizeStudySchedule({ windows: [{ day: 0, start: '17:00', end: '12:00' }], timezone: 'UTC' }),
    null
  );
});

test('normalizeStudySchedule keeps valid windows, dedupes weekday, sorts', () => {
  const s = normalizeStudySchedule({
    windows: [
      { day: 3, start: '20:00', end: '21:00' },
      { day: 0, start: '12:00', end: '17:00' },
      { day: 3, start: '08:00', end: '09:00' }, // dup weekday — dropped
      { day: 9, start: '10:00', end: '11:00' }, // bad day — dropped
    ],
    timezone: 'Asia/Riyadh',
  });
  assert.deepEqual(s, {
    windows: [
      { day: 0, start: '12:00', end: '17:00' },
      { day: 3, start: '20:00', end: '21:00' },
    ],
    timezone: 'Asia/Riyadh',
  });
});

test('buildSlots packs topics into each day window back-to-back', () => {
  const schedule: StudySchedule = {
    windows: [
      { day: 0, start: '12:00', end: '17:00' }, // Sun, 5h
      { day: 3, start: '20:00', end: '21:00' }, // Wed, 1h
    ],
    timezone: 'UTC',
  };
  const from = nextDow('2026-07-20', 6); // a Saturday, so the first study day is Sunday
  const slots = buildSlots(schedule, from, [2, 3, 1, 1.5]);
  assert.equal(slots.length, 4);

  // Sunday holds topic0 (12–14) then topic1 (14–17) — the 5h window is full.
  assert.equal(wd(slots[0].date), 0);
  assert.equal(slots[0].startTime, '12:00');
  assert.equal(slots[0].endTime, '14:00');
  assert.equal(slots[1].startTime, '14:00');
  assert.equal(slots[1].endTime, '17:00');
  assert.equal(slots[0].date, slots[1].date);

  // topic2 (1h) spills to Wed's 1h window.
  assert.equal(wd(slots[2].date), 3);
  assert.equal(slots[2].startTime, '20:00');
  assert.equal(slots[2].endTime, '21:00');

  // topic3 (1.5h) goes to the next Sunday.
  assert.equal(wd(slots[3].date), 0);
  assert.equal(slots[3].startTime, '12:00');
  assert.equal(slots[3].endTime, '13:30');
  assert.ok(slots[3].date > slots[0].date);
});

test('buildSlots places an oversized topic alone, overflowing its window', () => {
  const schedule: StudySchedule = {
    windows: [{ day: 3, start: '20:00', end: '21:00' }], // 1h window
    timezone: 'UTC',
  };
  const [slot] = buildSlots(schedule, nextDow('2026-07-20', 2), [3]); // 3h topic
  assert.equal(slot.startTime, '20:00');
  assert.equal(slot.endTime, '23:00'); // overflows the 1h window rather than stalling
});

test('todayIn returns a YYYY-MM-DD string', () => {
  assert.match(todayIn('UTC'), /^\d{4}-\d{2}-\d{2}$/);
});

-- When a user wants to study: a time window per weekday plus an IANA timezone,
-- as one jsonb blob (like advisor_settings) — e.g.
--   { "windows": [ { "day": 0, "start": "12:00", "end": "17:00" } ],
--     "timezone": "Asia/Riyadh" }   (day 0=Sun..6=Sat)
-- The plan page and the calendar sync both read it and pack topics into each
-- day's window, so the two always agree on when to study.
--
-- Null until the user sets one; the app treats null as "not scheduled yet".
alter table public.profiles
  add column if not exists study_schedule jsonb;

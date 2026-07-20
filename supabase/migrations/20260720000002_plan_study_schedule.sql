-- A per-plan override of the study schedule. Same jsonb shape as
-- profiles.study_schedule (see 20260720000001), but scoped to one plan: when set,
-- it wins over the profile's preferred schedule for that plan's sessions.
--
-- Null means "use my preferred schedule from the profile" — the common case, so
-- most plans leave this null and follow the profile default.
alter table public.study_plans
  add column if not exists study_schedule jsonb;

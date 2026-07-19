-- One study plan per (user, certification).
--
-- The UI now sends any "create a plan" path for a cert that already has one to the
-- existing plan instead of making a second. This constraint is the backstop, and
-- lets an existing plan be found by (user_id, certification_id).

-- Collapse any duplicates that already exist (e.g. from testing the advisor),
-- keeping the newest per (user, cert). Topic rows cascade with the deleted plans.
delete from public.study_plans s
using public.study_plans s2
where s.user_id = s2.user_id
  and s.certification_id = s2.certification_id
  and (s.created_at < s2.created_at
       or (s.created_at = s2.created_at and s.id < s2.id));

alter table public.study_plans drop constraint if exists study_plans_user_cert_unique;
alter table public.study_plans add constraint study_plans_user_cert_unique unique (user_id, certification_id);

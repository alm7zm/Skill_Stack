-- Baseline is ../schema.sql. Idempotent; safe to re-run.
--
-- Plan editing needs two things the schema did not have:
--   1. a DELETE policy on study_plan_topics, so editing can remove a topic's row
--   2. an atomic save, so the plan jsonb never drifts from the topic rows

-- 1. DELETE policy (schema.sql had select/insert/update only). Scoped through the
--    owning plan, matching the sibling policies.
drop policy if exists "Users can delete their own study plan topics." on public.study_plan_topics;
create policy "Users can delete their own study plan topics." on public.study_plan_topics
  for delete using (
    exists (
      select 1 from public.study_plans
      where id = study_plan_topics.study_plan_id and user_id = auth.uid()
    )
  );

-- 2. Transactional save. SECURITY INVOKER (the default, stated for clarity): every
--    statement inside still passes the caller's RLS, so this cannot touch another
--    user's plan — it only guarantees atomicity. PostgREST auto-commits each call
--    on its own, which is why the reconciliation cannot be three separate calls.
--    search_path is pinned empty and every name schema-qualified, per the codebase's
--    function-hardening convention.
create or replace function public.save_study_plan(
  p_plan_id uuid,
  p_certification_id text,
  p_plan jsonb,
  p_target_date date,
  p_insert_ids text[],
  p_delete_ids text[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_plan_id is null then
    insert into public.study_plans (user_id, certification_id, plan, target_date)
    values (auth.uid(), p_certification_id, p_plan, p_target_date)
    returning id into v_id;
  else
    update public.study_plans
      set plan = p_plan, target_date = p_target_date
      where id = p_plan_id
      returning id into v_id;
    -- RLS makes another user's (or a missing) plan update zero rows.
    if v_id is null then
      raise exception 'plan not found or not yours';
    end if;
  end if;

  if array_length(p_delete_ids, 1) is not null then
    delete from public.study_plan_topics
      where study_plan_id = v_id and topic_id = any(p_delete_ids);
  end if;

  if array_length(p_insert_ids, 1) is not null then
    insert into public.study_plan_topics (study_plan_id, topic_id, completed)
      select v_id, unnest(p_insert_ids), false
      on conflict (study_plan_id, topic_id) do nothing;
  end if;

  return v_id;
end;
$$;

-- Only signed-in users may call it; anon has no auth.uid().
revoke execute on function public.save_study_plan(uuid, text, jsonb, date, text[], text[]) from public, anon;
grant execute on function public.save_study_plan(uuid, text, jsonb, date, text[], text[]) to authenticated;

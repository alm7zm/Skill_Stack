-- Promote every reviewed resource proposal into the live catalog.
--
-- The n8n discovery workflow files new-resource findings into
-- certification_findings as (field 'resource_new', status 'open'), with
-- `proposal` holding a jsonb copy of the certification_resources row it
-- suggests. This copies those proposals into certification_resources and marks
-- the findings accepted.
--
-- Run it in the Supabase SQL editor. It is transactional (all-or-nothing) and
-- safe to re-run: a proposal whose url is already in the catalog is skipped, and
-- duplicate proposals of the same url collapse to the highest-confidence one.
--
-- ponytail: bulk-promotes EVERYTHING open, which is what was asked. To promote
-- selectively instead, add a filter to the insert's WHERE, e.g.
--   and r.confidence >= 0.8
--   and r.id = '<a specific report id>'
-- and narrow the UPDATE the same way.

begin;

insert into public.certification_resources
  (id, certification_id, title, provider, url, duration, free, type, ai_reason, verified_by)
select distinct on (r.proposal->>'url')
  -- New id: the 'r1'..'r31' scheme was only ever the hand-seed's; nothing
  -- requires that format, and a uuid can't collide with a future seed re-run.
  gen_random_uuid()::text,
  r.certification_id,
  r.proposal->>'title',
  r.proposal->>'provider',
  r.proposal->>'url',
  r.proposal->>'duration',
  (r.proposal->>'free')::boolean,
  -- The model emits freeform types (Course, Study Guide, official exam page...);
  -- coerce onto the catalog's five. Anything that isn't a course/book/video/
  -- practice-exam is a page-you-read, so it lands as documentation.
  case lower(trim(r.proposal->>'type'))
    when 'book' then 'book'
    when 'course' then 'course'
    when 'video' then 'video'
    when 'documentation' then 'documentation'
    when 'practice exam' then 'practice-exam'
    when 'practice test' then 'practice-exam'
    when 'practice_exam' then 'practice-exam'
    else 'documentation'
  end,
  r.proposal->>'ai_reason',
  'n8n'
from public.certification_findings r
where r.field = 'resource_new'
  and r.status = 'open'
  and r.proposal is not null
  -- Skip a url already in the catalog (a re-run, or a seeded resource the bot
  -- re-found). url isn't unique-constrained, so this guard does the deduping.
  and not exists (
    select 1 from public.certification_resources cr
    where cr.url = r.proposal->>'url'
  )
order by r.proposal->>'url', r.confidence desc nulls last;

-- Resolve the queue. Dups (url already present) are marked accepted too — the
-- resource they wanted is in the catalog, so the finding is genuinely settled.
update public.certification_findings
set status = 'accepted'
where field = 'resource_new' and status = 'open';

commit;

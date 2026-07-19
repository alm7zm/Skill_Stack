-- Split the two producers that shared certification_reports into two tables.
--
-- certification_reports was built as one "proposal queue" for both a person
-- (prose corrections) and the n8n bot (machine findings with a jsonb proposal).
-- In practice only the bot ever wrote to it — every row is source 'n8n',
-- field 'resource_new'. Merging the two made triage one screen, but it also
-- means a human correction and a bot's resource suggestion sit in the same
-- table with half the columns null for whichever producer didn't write them.
--
-- This gives the bot its own table, certification_findings, and returns
-- certification_reports to what the app's report form actually writes: a user
-- correcting a fact. Split by SOURCE, so anything the bot emits (resource_new
-- today, resource_dead/resource_changed/cert_facts if it grows) lands in
-- findings, and certification_reports only ever holds people's words.
--
-- Idempotent: the data move + column drops run only while the `source` column
-- still exists on certification_reports, so a second run is a no-op.
--
-- AFTER APPLYING: repoint the n8n workflow to insert into
-- public.certification_findings (same columns minus user_id/source), and run
-- the updated scripts/promote-reviewed-resources.sql, which now reads findings.

-- ---------------------------------------------------------------------------
-- 1. The bot's table
-- ---------------------------------------------------------------------------
create table if not exists public.certification_findings (
  id uuid default uuid_generate_v4() primary key,
  certification_id text references public.certifications(id) on delete cascade not null,

  -- The resource this is about, when it is about one. Null for a brand-new
  -- resource that does not exist yet (resource_new) or a fact about the
  -- certification itself (cert_facts).
  resource_id text references public.certification_resources(id) on delete cascade,

  field text not null check (field in (
    'resource_dead',      -- a stored url stopped resolving
    'resource_new',       -- a resource worth adding; proposal holds the row
    'resource_changed',   -- title/price/duration drifted from the live page
    'cert_facts'          -- exam cost/duration/questions drifted from official_url
  )),

  -- Human-readable summary of the finding.
  message text not null check (char_length(trim(message)) between 1 and 1000),

  -- Machine-readable patch: what to paste into the row if a reviewer agrees.
  proposal jsonb,

  -- The URL host a proposed resource came from ('youtube.com', 'aws.amazon.com'),
  -- derived from the proposal url by the workflow so a reviewer sees provenance
  -- at a glance. Null when the finding is not about a specific url.
  source_site text,

  -- The bot's confidence in its own claim, 0..1 — lets triage float the sure
  -- wins to the top.
  confidence numeric(3, 2) check (confidence is null or confidence between 0 and 1),

  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists certification_findings_triage_idx
  on public.certification_findings (status, confidence desc nulls last);
create index if not exists certification_findings_cert_idx
  on public.certification_findings (certification_id);

-- No policies: findings are the bot's and the reviewer's, never a browser's.
-- With RLS on and no policy, only service_role (n8n, the Supabase SQL editor)
-- can touch this table — the app's anon/authenticated clients see nothing.
alter table public.certification_findings enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Move the bot's rows over, then strip the bot's columns from reports
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'certification_reports'
      and column_name = 'source'
  ) then
    -- Preserve ids and timestamps so nothing that referenced a finding breaks.
    insert into public.certification_findings
      (id, certification_id, resource_id, field, message, proposal, source_site, confidence, status, created_at)
    select id, certification_id, resource_id, field, message, proposal, source_site, confidence, status, created_at
    from public.certification_reports
    where source = 'n8n';

    delete from public.certification_reports where source = 'n8n';

    -- This index named the bot columns; drop it before they go.
    drop index if exists public.certification_reports_triage_idx;

    -- Dropping source/resource_id/confidence takes their constraints with them.
    alter table public.certification_reports drop column if exists source;
    alter table public.certification_reports drop column if exists resource_id;
    alter table public.certification_reports drop column if exists proposal;
    alter table public.certification_reports drop column if exists source_site;
    alter table public.certification_reports drop column if exists confidence;

    -- Narrow the field check back to the six things a person reports.
    alter table public.certification_reports
      drop constraint if exists certification_reports_field_check;
    alter table public.certification_reports
      add constraint certification_reports_field_check check (field in (
        'exam_cost', 'study_hours', 'exam_details', 'prerequisites', 'url', 'other'
      ));
  end if;
end $$;

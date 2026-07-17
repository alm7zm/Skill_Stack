-- Move learning resources out of src/lib/data/resources.ts, and open the catalog
-- to an automated maintainer (n8n).
--
-- Why resources move: an n8n workflow cannot edit a TypeScript array that is
-- compiled into the app bundle. Automating "check this link still works" or
-- "propose a new course" requires the rows to be data, not code. This is the
-- same move certifications made in 20260717000001, for the same reason, and it
-- leaves no reference data in code at all.
--
-- The shape here follows one rule: a bot may state facts it cannot get wrong,
-- and may only propose the rest.
--
--   * A URL returning 404 is objectively 404      -> resources.http_status,
--                                                    written automatically
--   * "The exam now costs $175" is a judgement    -> catalog_reports, reviewed
--                                                    by a human before it ships
--
-- The reason for the split is verified_at. A bot that scrapes a price and writes
-- it with verified_at = today converts honestly-stale data into confidently
-- wrong data, and makes verified_by a lie. Staleness is visible and recoverable;
-- a bad fact wearing a fresh timestamp is neither.
--
-- Baseline is 20260717000001_certifications_table.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Resources
-- ---------------------------------------------------------------------------
create table if not exists public.certification_resources (
  -- Text ids ('r1'...'r31') rather than uuid: these are already referenced by
  -- id inside study_plans.plan -> weeks[].resourceIds on live rows. Renumbering
  -- them into uuids would orphan every generated plan.
  id text primary key,
  certification_id text references public.certifications(id) on delete cascade not null,

  title text not null,
  provider text not null,
  url text not null check (url like 'http%'),
  duration text not null,
  free boolean not null default false,
  type text not null check (type in ('course', 'documentation', 'video', 'practice-exam', 'book')),

  -- Why the advisor should pick this one. Shown to the model, not the user.
  ai_reason text,

  -- Provenance, same contract as certifications: who last checked, and when.
  verified_at date not null default current_date,
  verified_by text,

  -- Link health. Written by automation, because none of it is a judgement call.
  -- http_status null = never checked. A resource is hidden from the app when
  -- dead, rather than deleted: deleting it would break the resourceIds of every
  -- plan that already links to it, and a dead link is worth keeping a record of.
  last_checked_at timestamp with time zone,
  http_status integer,
  dead boolean not null default false,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists certification_resources_cert_idx
  on public.certification_resources (certification_id) where not dead;

alter table public.certification_resources enable row level security;

-- Public reference data, like the catalog it hangs off. No user data here.
drop policy if exists "Resources are viewable by everyone." on public.certification_resources;
create policy "Resources are viewable by everyone." on public.certification_resources
  for select using (true);

-- No insert/update/delete policy, deliberately. RLS denies what it does not
-- permit, so anon and authenticated can read and nothing else. n8n writes with
-- the service_role key, which bypasses RLS — that key is a backend credential
-- and must never reach a browser.

-- ---------------------------------------------------------------------------
-- 2. One review queue, for people and bots alike
-- ---------------------------------------------------------------------------
-- certification_reports already is a proposal queue: a claim about a row, and a
-- status a human moves to accepted or rejected. A bot's finding is the same
-- shape, so it reuses the table rather than getting a parallel one that would
-- need its own triage screen. Renamed in spirit, not in name — renaming the
-- table would break the app's existing report flow for no gain.

-- Who raised it. Bots have no user_id (nullable already), so without this a bot
-- row and a deleted user's row are indistinguishable.
alter table public.certification_reports
  add column if not exists source text not null default 'user';

do $$ begin
  alter table public.certification_reports
    add constraint certification_reports_source_check
    check (source in ('user', 'n8n'));
exception when duplicate_object then null; end $$;

-- Which resource, when the finding is about one rather than the certification.
-- Null means "about the certification itself", or "a resource that does not
-- exist yet" — see proposal below.
alter table public.certification_reports
  add column if not exists resource_id text
  references public.certification_resources(id) on delete cascade;

-- What the bot suggests, machine-readable, e.g.
--   {"exam_cost": 175, "evidence_url": "https://...", "found_at": "..."}
-- A human reads `message`; this is what they would paste into the row if they
-- agree. Null for user reports — people write prose, not patches.
alter table public.certification_reports
  add column if not exists proposal jsonb;

-- Confidence the bot puts on its own claim, 0..1. Null for humans, who do not
-- come with one. Lets triage sort the obvious wins to the top.
alter table public.certification_reports
  add column if not exists confidence numeric(3, 2)
  check (confidence is null or confidence between 0 and 1);

-- The `field` check was written for the six things a person might report. A bot
-- reports different things, so widen it rather than overload 'other' — 'other'
-- is where findings go to be ignored.
alter table public.certification_reports
  drop constraint if exists certification_reports_field_check;

alter table public.certification_reports
  add constraint certification_reports_field_check check (field in (
    -- from people
    'exam_cost', 'study_hours', 'exam_details', 'prerequisites', 'url', 'other',
    -- from automation
    'resource_dead',      -- a stored url stopped resolving
    'resource_new',       -- a resource worth adding; proposal holds the row
    'resource_changed',   -- title/price/duration drifted from the live page
    'cert_facts'          -- exam cost/duration/questions drifted from official_url
  ));

create index if not exists certification_reports_triage_idx
  on public.certification_reports (status, source, confidence desc nulls last);

-- The existing insert policy is `auth.uid() = user_id`, which is what keeps the
-- endpoint unspammable. It needs no change: service_role bypasses RLS entirely,
-- so n8n can insert rows with user_id null and source 'n8n', and a browser still
-- cannot forge either.

-- ponytail: no catalog_links view unioning certifications and resources. It read
-- well and was wrong: the two kinds need different handling (a resource can be
-- marked dead, a certification's official_url cannot — there is no such column,
-- and there should not be, since a moved provider page is a fact to re-check,
-- not a row to hide). One shape for two behaviours just moves the branch into
-- the workflow and gives it a null id to trip over. n8n queries each table for
-- what it can actually do to it.

-- ---------------------------------------------------------------------------
-- 3. Seed — 31 rows, generated from src/lib/data/resources.ts
-- ---------------------------------------------------------------------------
-- Idempotent: re-running restores the shipped values but leaves link-health
-- columns alone, since those are the bot's to own and are not in this file.
insert into public.certification_resources
  (id, certification_id, title, provider, url, duration, free, type, ai_reason)
values
  ('r1', 'aws-saa', 'AWS Certified Solutions Architect Official Study Guide', 'AWS', 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', '40 hours', false, 'book', 'Official study material covering all exam domains comprehensively'),
  ('r2', 'aws-saa', 'AWS Skill Builder - Solutions Architect Learning Path', 'AWS Skill Builder', 'https://skillbuilder.aws/', '30 hours', true, 'course', 'Free official training directly from AWS with hands-on labs'),
  ('r3', 'aws-saa', 'Stephane Maarek - Ultimate AWS SAA Course', 'Udemy', 'https://www.udemy.com/course/aws-certified-solutions-architect-associate-saa-c03/', '27 hours', false, 'course', 'Highest-rated SAA course with 900K+ students, regularly updated'),
  ('r4', 'aws-saa', 'AWS Well-Architected Framework', 'AWS Documentation', 'https://docs.aws.amazon.com/wellarchitected/latest/framework/', '8 hours', true, 'documentation', 'Essential reading — exam questions are heavily based on these principles'),
  ('r5', 'aws-saa', 'Tutorial Dojo Practice Exams', 'Tutorial Dojo', 'https://tutorialsdojo.com/aws-certified-solutions-architect-associate-saa-c03/', '10 hours', false, 'practice-exam', 'Closest to actual exam format, excellent for identifying knowledge gaps'),
  ('r6', 'az-900', 'Microsoft Learn - Azure Fundamentals Path', 'Microsoft Learn', 'https://learn.microsoft.com/en-us/training/paths/az-900-describe-cloud-concepts/', '10 hours', true, 'course', 'Official free training with interactive exercises and knowledge checks'),
  ('r7', 'az-900', 'AZ-900 Azure Fundamentals Exam Prep', 'YouTube', 'https://www.youtube.com/watch?v=NKEFWlXjtIg', '3 hours', true, 'video', 'Comprehensive free crash course perfect for last-minute revision'),
  ('r8', 'az-900', 'Azure Fundamentals (AZ-900) Course', 'Coursera', 'https://www.coursera.org/learn/microsoft-azure-fundamentals', '15 hours', false, 'course', 'Structured learning with graded assessments and certificate of completion'),
  ('r9', 'comptia-security-plus', 'CompTIA Security+ Study Guide', 'CompTIA', 'https://www.comptia.org/training/books/security-sy0-701-study-guide', '45 hours', false, 'book', 'Official study guide aligned with current exam objectives'),
  ('r10', 'comptia-security-plus', 'Professor Messer Security+ Course', 'YouTube', 'https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/', '20 hours', true, 'video', 'Industry-favorite free resource, clear explanations of every exam objective'),
  ('r11', 'comptia-security-plus', 'Security+ Practice Tests', 'Udemy', 'https://www.udemy.com/course/comptia-security-practice-tests/', '8 hours', false, 'practice-exam', 'Most realistic practice tests with detailed explanations'),
  ('r12', 'cisco-ccna', 'Cisco Skills for All - Networking Essentials', 'Cisco Skills for All', 'https://skillsforall.com/course/networking-essentials', '70 hours', true, 'course', 'Free official Cisco training with packet tracer labs'),
  ('r13', 'cisco-ccna', 'Neil Anderson Complete CCNA Course', 'Udemy', 'https://www.udemy.com/course/ccna-complete/', '60 hours', false, 'course', 'Most comprehensive CCNA course with lab exercises'),
  ('r14', 'cisco-ccna', 'Cisco CCNA Documentation', 'Cisco Documentation', 'https://www.cisco.com/c/en/us/training-events/training-certifications/certifications/associate/ccna.html', '30 hours', true, 'documentation', 'Official exam topics and study materials from Cisco'),
  ('r15', 'pmp', 'PMBOK Guide 7th Edition', 'PMI', 'https://www.pmi.org/pmbok-guide-standards/foundational/pmbok', '60 hours', false, 'book', 'Essential reference guide — the primary source for exam questions'),
  ('r16', 'pmp', 'Joseph Phillips PMP Prep Course', 'Udemy', 'https://www.udemy.com/course/pmp-pmbok6-35-pdus/', '35 hours', false, 'course', 'Fulfills 35 contact hour requirement, highest-rated PMP course'),
  ('r17', 'pmp', 'PMI Practice Exam', 'PMI', 'https://www.pmi.org/certifications/project-management-pmp/exam-prep', '10 hours', false, 'practice-exam', 'Official PMI practice questions — closest to actual exam'),
  ('r18', 'cka', 'Kubernetes Documentation', 'Kubernetes', 'https://kubernetes.io/docs/home/', '40 hours', true, 'documentation', 'Allowed during exam — mastering navigation is a huge advantage'),
  ('r19', 'cka', 'CKA with Practice Tests', 'Udemy', 'https://www.udemy.com/course/certified-kubernetes-administrator-with-practice-tests/', '17 hours', false, 'course', 'KodeKloud lab environment included for hands-on practice'),
  ('r20', 'cka', 'Killer.sh CKA Simulator', 'Killer.sh', 'https://killer.sh/', '4 hours', false, 'practice-exam', 'Included with exam purchase, harder than real exam — great preparation'),
  ('r21', 'az-104', 'Microsoft Learn - Azure Administrator Path', 'Microsoft Learn', 'https://learn.microsoft.com/en-us/training/paths/az-104-administrator-prerequisites/', '25 hours', true, 'course', 'Official free learning path with sandbox labs'),
  ('r22', 'az-104', 'AZ-104 Azure Administrator Course', 'Coursera', 'https://www.coursera.org/professional-certificates/microsoft-azure-administrator', '40 hours', false, 'course', 'Structured Microsoft-official course with graded projects'),
  ('r23', 'terraform-associate', 'HashiCorp Terraform Documentation', 'HashiCorp', 'https://developer.hashicorp.com/terraform/docs', '20 hours', true, 'documentation', 'Official docs cover every exam topic in depth'),
  ('r24', 'terraform-associate', 'Terraform Associate Study Guide', 'Udemy', 'https://www.udemy.com/course/terraform-beginner-to-advanced/', '12 hours', false, 'course', 'Hands-on course with real-world infrastructure projects'),
  ('r25', 'gcp-ace', 'Google Cloud Skills Boost', 'Google Cloud Skills Boost', 'https://www.cloudskillsboost.google/', '40 hours', true, 'course', 'Official Google training with Qwiklabs hands-on exercises'),
  ('r26', 'gcp-ace', 'GCP ACE Course', 'Coursera', 'https://www.coursera.org/professional-certificates/cloud-engineering-gcp', '30 hours', false, 'course', 'Google-official professional certificate on Coursera'),
  ('r27', 'ai-900', 'Microsoft Learn - AI Fundamentals Path', 'Microsoft Learn', 'https://learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence-on-azure/', '8 hours', true, 'course', 'Official free path covering all AI-900 exam objectives'),
  ('r28', 'tf-developer', 'DeepLearning.AI TensorFlow Developer Specialization', 'Coursera', 'https://www.coursera.org/professional-certificates/tensorflow-in-practice', '40 hours', false, 'course', 'Created by Laurence Moroney (Google) — directly aligned with exam content'),
  ('r29', 'tf-developer', 'TensorFlow Official Tutorials', 'TensorFlow', 'https://www.tensorflow.org/tutorials', '20 hours', true, 'documentation', 'Official tutorials with runnable Colab notebooks'),
  ('r30', 'psm-1', 'The Scrum Guide', 'Scrum.org', 'https://scrumguides.org/', '1 hour', true, 'documentation', 'THE primary source — every exam question derives from this 13-page guide'),
  ('r31', 'psm-1', 'Scrum.org Open Assessments', 'Scrum.org', 'https://www.scrum.org/open-assessments', '3 hours', true, 'practice-exam', 'Free official practice tests — aim for 100% before taking the exam')
on conflict (id) do update set
  certification_id = excluded.certification_id,
  title            = excluded.title,
  provider         = excluded.provider,
  url              = excluded.url,
  duration         = excluded.duration,
  free             = excluded.free,
  type             = excluded.type,
  ai_reason        = excluded.ai_reason,
  updated_at       = timezone('utc'::text, now());

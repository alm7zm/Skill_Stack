-- Learner resource preferences, and provenance on proposed resources.
--
-- Two independent needs, one migration because both are small:
--
--   1. The advisor already knows a learner's budget and time, but not what KIND
--      of resource they like. A video learner and a docs learner get the same
--      plan today. Two array columns hold the preference; the advisor treats
--      them as soft (prefer, never exclude — see resourcesForBudget's sibling
--      reasoning in src/lib/ai/advisor.ts).
--
--   2. When discover-resources proposes a resource, the reviewer wants to see
--      where it came from at a glance ("a YouTube video" reads very differently
--      from "the official docs"). source_site carries that, derived from the URL
--      host by the workflow, not typed by the model.
--
-- Idempotent and safe to re-run.

alter table public.profiles
  add column if not exists preferred_resource_formats text[] not null default '{}',
  add column if not exists preferred_resource_sites   text[] not null default '{}';

-- Formats are a closed set (they mirror certification_resources.type), so the
-- database can guarantee it. `<@` is "is contained by": every element must be
-- one of these. Sites are a UI-curated list that may grow, so they are checked
-- in the server action instead of pinned here — adding a platform should not
-- need a migration.
alter table public.profiles
  drop constraint if exists profiles_preferred_formats_check;
alter table public.profiles
  add constraint profiles_preferred_formats_check
  check (preferred_resource_formats <@ array['video','course','documentation','practice-exam','book']::text[]);

alter table public.certification_reports
  add column if not exists source_site text;

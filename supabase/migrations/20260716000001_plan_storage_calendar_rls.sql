-- Baseline is ../schema.sql (apply that first on a fresh database).
-- This delta is idempotent and safe to re-run against an existing one.
--
-- 1. Somewhere to keep an AI-generated plan
-- 2. Google Calendar token + event storage
-- 3. Privacy fix: profiles were world-readable

-- ---------------------------------------------------------------------------
-- 1. AI-generated plan body
-- ---------------------------------------------------------------------------
-- study_plans held only certification_id + target_date, and study_plan_topics
-- held a bare topic_id, so a generated roadmap (weeks, titles, hours, resources)
-- had nowhere to live. Kept as jsonb rather than modelled into tables: it is
-- written once by the advisor and read whole. Normalise it if it ever needs
-- querying across plans.
alter table public.study_plans
  add column if not exists plan jsonb;

-- ---------------------------------------------------------------------------
-- 2. Google Calendar
-- ---------------------------------------------------------------------------
-- Lets a re-sync update the existing event instead of creating a duplicate.
alter table public.study_plan_topics
  add column if not exists calendar_event_id text;

-- Supabase exposes provider_refresh_token only at sign-in, and never again.
-- To write to a calendar later (background sync, re-sync) it has to be kept.
create table if not exists public.user_integrations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null,
  refresh_token text not null,
  scope text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, provider)
);

alter table public.user_integrations enable row level security;

-- Deliberately NO policies. RLS with zero policies denies everyone, including
-- the anon key used by our server components. Only the service_role key bypasses
-- RLS, so refresh tokens are unreachable from any browser session even if one is
-- compromised. This is why the calendar route needs SUPABASE_SERVICE_ROLE_KEY.

drop trigger if exists on_user_integrations_updated on public.user_integrations;
create trigger on_user_integrations_updated
  before update on public.user_integrations
  for each row execute procedure public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Privacy fix
-- ---------------------------------------------------------------------------
-- schema.sql shipped: for select using (true)
-- Every row of public.profiles was readable by anyone holding the anon key —
-- which ships to the browser. That exposed every user's email, career_goal,
-- job_role and budget. Nothing in the app reads other users' profiles, so
-- scope it to the owner.
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;

drop policy if exists "Users can view own profile." on public.profiles;
create policy "Users can view own profile." on public.profiles
  for select using (auth.uid() = id);

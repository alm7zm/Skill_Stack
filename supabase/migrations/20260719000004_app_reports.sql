-- A general "report a problem" channel, reachable from the account menu on any
-- page — unlike certification_reports, which is a correction about one specific
-- certification. Just a short message and who sent it; triage happens in the
-- Supabase dashboard under service_role.
--
-- Idempotent and safe to re-run.

create table if not exists public.app_reports (
  id uuid default uuid_generate_v4() primary key,

  -- set null, not cascade: a report outlives the account that sent it. Deleting
  -- a user should not erase a problem they took the time to flag.
  user_id uuid references public.profiles(id) on delete set null,

  -- What kind of problem, so triage can sort at a glance — mirrors the "What's
  -- wrong?" picker in certification_reports, but for the app as a whole.
  category text not null check (category in ('bug', 'content', 'idea', 'other')),
  message text not null check (char_length(trim(message)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists app_reports_open_idx
  on public.app_reports (status, created_at desc);

alter table public.app_reports enable row level security;

-- Sign-in required, and the author is unforgeable (auth.uid() = user_id). No
-- select policy on purpose: the app never reads reports back to a user, and
-- triage is the dashboard's job under service_role.
drop policy if exists "Users can file a report." on public.app_reports;
create policy "Users can file a report." on public.app_reports
  for insert with check (auth.uid() = user_id);

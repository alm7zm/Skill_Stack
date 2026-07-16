-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  full_name text,
  avatar_url text,
  career_goal text,
  job_role text,
  experience_level text,
  budget numeric,
  daily_study_time numeric,
  weekly_availability numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- USER SKILLS
create table public.user_skills (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  skill_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, skill_name)
);

-- USER LANGUAGES
create table public.user_languages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  language_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, language_name)
);

-- STUDY PLANS
create table public.study_plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  certification_id text not null,
  target_date timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- STUDY PLAN TOPICS (State tracking)
create table public.study_plan_topics (
  id uuid default uuid_generate_v4() primary key,
  study_plan_id uuid references public.study_plans(id) on delete cascade not null,
  topic_id text not null,
  completed boolean default false not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(study_plan_id, topic_id)
);

-- RLS POLICIES
alter table public.profiles enable row level security;
alter table public.user_skills enable row level security;
alter table public.user_languages enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_plan_topics enable row level security;

-- Profiles policies
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- Other tables: users can only see and modify their own data
create policy "Users can see their own skills." on public.user_skills for select using (auth.uid() = user_id);
create policy "Users can insert their own skills." on public.user_skills for insert with check (auth.uid() = user_id);
create policy "Users can delete their own skills." on public.user_skills for delete using (auth.uid() = user_id);

create policy "Users can see their own languages." on public.user_languages for select using (auth.uid() = user_id);
create policy "Users can insert their own languages." on public.user_languages for insert with check (auth.uid() = user_id);
create policy "Users can delete their own languages." on public.user_languages for delete using (auth.uid() = user_id);

create policy "Users can see their own study plans." on public.study_plans for select using (auth.uid() = user_id);
create policy "Users can insert their own study plans." on public.study_plans for insert with check (auth.uid() = user_id);
create policy "Users can update their own study plans." on public.study_plans for update using (auth.uid() = user_id);
create policy "Users can delete their own study plans." on public.study_plans for delete using (auth.uid() = user_id);

create policy "Users can see their own study plan topics." on public.study_plan_topics for select using (
  exists (select 1 from public.study_plans where id = study_plan_topics.study_plan_id and user_id = auth.uid())
);
create policy "Users can insert their own study plan topics." on public.study_plan_topics for insert with check (
  exists (select 1 from public.study_plans where id = study_plan_topics.study_plan_id and user_id = auth.uid())
);
create policy "Users can update their own study plan topics." on public.study_plan_topics for update using (
  exists (select 1 from public.study_plans where id = study_plan_topics.study_plan_id and user_id = auth.uid())
);

-- Triggers for updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_profile_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger on_study_plan_updated
  before update on public.study_plans
  for each row execute procedure public.handle_updated_at();

-- Trigger for creating profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

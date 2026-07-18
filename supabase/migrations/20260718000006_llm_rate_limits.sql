-- Per-user rate limiting for the paid LLM endpoints (/api/advisor and
-- /api/advisor/plan). One row per call; the route counts a user's recent rows
-- in a short window before spending money on the model.
create table if not exists public.llm_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists llm_calls_lookup
  on public.llm_calls (user_id, action, created_at desc);

-- RLS on with zero policies, exactly like user_integrations: this is a
-- service-role-only table. The route writes it with the service key; a user must
-- not be able to read, forge, or delete their own counter to bypass the limit.
alter table public.llm_calls enable row level security;

-- Two more things the advisor should know, and one the user should control.
--
--   1. A skill without a level is half a fact. "Linux" could mean "I've heard of
--      it" or "I maintain kernels". user_skills.level captures which, using the
--      same beginner/intermediate/advanced words the profile and catalog already
--      use. Nullable, no default: rows added before this migration had no level
--      and inventing one would be a guess — the advisor simply omits it.
--
--   2. advisor_settings lets a user tune how the advisor talks (tone, length,
--      how much it asks) and how hard it paces a plan (intensity). One jsonb, not
--      four columns, so a fifth knob later needs no migration; the shape and the
--      allowed values are enforced in code (src/lib/advisor-settings.ts) where
--      the UI can share them.
--
-- Idempotent and safe to re-run.

alter table public.user_skills
  add column if not exists level text
  check (level in ('beginner', 'intermediate', 'advanced'));

alter table public.profiles
  add column if not exists advisor_settings jsonb not null default '{}'::jsonb;

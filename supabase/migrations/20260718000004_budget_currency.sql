-- Let a user hold their budget in their own currency.
--
-- The budget number meant nothing without a currency, and "USD" was hardcoded
-- in the UI and the advisor prompt — wrong for most of the world. This stores
-- the choice; the allowed set is validated in the server action (src/lib/
-- currencies.ts) so adding a currency needs no migration. Defaults to USD so
-- existing rows keep the value they were implicitly already in.
--
-- Idempotent and safe to re-run.

alter table public.profiles
  add column if not exists budget_currency text not null default 'USD';

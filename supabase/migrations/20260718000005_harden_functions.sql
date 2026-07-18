-- Clears the Supabase linter's "Function Search Path Mutable" and "... Can
-- Execute SECURITY DEFINER Function" warnings.

-- Pin search_path on the trigger functions. All three already schema-qualify
-- their table references, so an empty search_path resolves everything the same
-- (pg_catalog stays implicitly searched, so concat_ws/array_to_string/->> still
-- resolve). Matters most for handle_new_user, which is SECURITY DEFINER.
alter function public.handle_updated_at() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.certification_search_text() set search_path = '';

-- handle_new_user is SECURITY DEFINER and only ever meant to fire from the
-- on_auth_user_created trigger. Postgres won't let a returns-trigger function be
-- called directly over the API, but the default PUBLIC execute grant still trips
-- the linter — drop it so the function is out of the exposed surface entirely.
-- (The trigger keeps firing; trigger execution doesn't check EXECUTE.)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

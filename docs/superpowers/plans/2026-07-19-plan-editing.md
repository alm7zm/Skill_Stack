# Plan Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user edit a study plan directly, build one without the advisor, and ask the advisor to revise an existing plan — all through one shared editor and one transactional save.

**Architecture:** A single client `PlanEditor` holds the plan as a draft; a `savePlan` server action validates it and persists the whole plan plus a topic-row reconciliation atomically via a `SECURITY INVOKER` `plpgsql` RPC. Pure topic-id helpers (normalize / diff / collect / AI-id-match) live in `src/lib/plan/` and are unit-tested with `node --test`. The advisor-edit is a one-shot route that returns a revised plan the editor previews.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Tailwind v4, Supabase (Postgres + RLS, `@supabase/ssr`), `ai` v7 + `@ai-sdk/google` (`generateObject`), Zod, `node --test`.

## Global Constraints

- **This is NOT stock Next.js** — read `node_modules/next/dist/docs/` before using an unfamiliar API (per `AGENTS.md`). `middleware.ts` is `proxy.ts`; `cookies()` is async.
- **RLS is the security boundary.** Never filter by `user_id` in app code as a substitute; the request-scoped client (`@/lib/supabase/server`) runs as the user. Never trust a client-supplied `user_id` — the owner is always `auth.uid()`.
- **Never print or commit secrets.** `SUPABASE_SERVICE_ROLE_KEY` and API keys stay server-side. This feature uses only the request-scoped (anon) client — no service role.
- **Bilingual en/ar with full RTL.** Every user-facing string comes from `src/app/[lang]/dictionaries/{en,ar}.json`; keys must stay at parity. Use CSS logical properties (`ms-`/`me-`/`ps-`/`pe-`/`text-start`/`border-s`) so RTL flips for free. Sentence case, no emoji.
- **Plan bounds:** 1–104 weeks; `estimatedHours` ≥ 0; a plan must contain ≥ 1 topic; topic ids non-empty and unique per plan.
- **Node-testable lib rule:** files under `src/lib/plan/` are run directly by `node --test`, which resolves neither the `@/` alias nor extensionless imports. Use **relative imports with `.ts` extension** for runtime imports; `@/`-aliased imports are allowed only when `import type` (they erase before Node sees them). Mirror `src/lib/ai/advisor.ts`.
- **Gate before every commit that touches app code:** `npx tsc --noEmit`, `npm test`, `npx eslint .`, the dict-parity check (Task 8), and `npx next build`. Lib-only tasks may commit after `npm test` + `tsc` + `eslint`.
- **Migrations are applied by the human** against their Supabase project (they have said so). A migration task delivers the SQL and a verification query; it does not run the migration itself.

---

## File Structure

**Create**
- `supabase/migrations/20260719000001_plan_editing.sql` — DELETE policy on `study_plan_topics` + `save_study_plan` RPC.
- `src/lib/plan/types.ts` — `EditableTopic`, `EditableWeek`, `EditablePlan` (the stored-jsonb shape; no imports, node-safe).
- `src/lib/plan/reconcile.ts` — `normalizeWeeks`, `collectTopicIds`, `planTopicDiff`, `matchTopicIds` (pure).
- `src/lib/plan/reconcile.test.ts` — unit tests for the above.
- `src/lib/plan/schema.ts` — `storedPlanSchema`, `savePlanSchema`, `editRequestSchema` (Zod).
- `src/lib/plan/schema.test.ts` — unit tests for validation.
- `src/app/[lang]/(app)/plan/actions.ts` — `savePlan` server action (shared by edit + new pages).
- `src/app/api/advisor/plan/edit/route.ts` — one-shot advisor-edit route.
- `src/components/app/plan-editor.tsx` — the `PlanEditor` client component.
- `src/app/[lang]/(app)/plan/[planId]/edit/page.tsx` — edit an existing plan (RSC).
- `src/app/[lang]/(app)/plan/new/page.tsx` — certification picker (RSC).
- `src/app/[lang]/(app)/plan/new/[certId]/page.tsx` — new blank plan (RSC).

**Modify**
- `src/app/[lang]/dictionaries/en.json`, `.../ar.json` — editor / entry-point / error strings.
- `src/app/[lang]/(app)/plan/[planId]/page.tsx` — add an **Edit** button.
- `src/app/[lang]/(app)/certification/[id]/page.tsx` — add **Build it yourself** beside "Ask the advisor".
- `src/app/[lang]/(app)/dashboard/page.tsx` — add **New plan** entry.

---

## Task 1: Migration — DELETE policy + transactional save RPC

**Files:**
- Create: `supabase/migrations/20260719000001_plan_editing.sql`

**Interfaces:**
- Produces: RPC `save_study_plan(p_plan_id uuid, p_certification_id text, p_plan jsonb, p_target_date date, p_insert_ids text[], p_delete_ids text[]) returns uuid` — inserts (when `p_plan_id` is null) or updates a `study_plans` row, deletes the given topic rows, inserts the given topic rows, all in one transaction; returns the plan id. Callable by `authenticated` only.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260719000001_plan_editing.sql`:

```sql
-- Baseline is ../schema.sql. Idempotent; safe to re-run.
--
-- Plan editing needs two things the schema did not have:
--   1. a DELETE policy on study_plan_topics, so editing can remove a topic's row
--   2. an atomic save, so the plan jsonb never drifts from the topic rows

-- 1. DELETE policy (schema.sql had select/insert/update only). Scoped through the
--    owning plan, matching the sibling policies.
drop policy if exists "Users can delete their own study plan topics." on public.study_plan_topics;
create policy "Users can delete their own study plan topics." on public.study_plan_topics
  for delete using (
    exists (
      select 1 from public.study_plans
      where id = study_plan_topics.study_plan_id and user_id = auth.uid()
    )
  );

-- 2. Transactional save. SECURITY INVOKER (the default, stated for clarity): every
--    statement inside still passes the caller's RLS, so this cannot touch another
--    user's plan — it only guarantees atomicity. PostgREST auto-commits each call
--    on its own, which is why the reconciliation cannot be three separate calls.
--    search_path is pinned empty and every name schema-qualified, per the codebase's
--    function-hardening convention.
create or replace function public.save_study_plan(
  p_plan_id uuid,
  p_certification_id text,
  p_plan jsonb,
  p_target_date date,
  p_insert_ids text[],
  p_delete_ids text[]
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_plan_id is null then
    insert into public.study_plans (user_id, certification_id, plan, target_date)
    values (auth.uid(), p_certification_id, p_plan, p_target_date)
    returning id into v_id;
  else
    update public.study_plans
      set plan = p_plan, target_date = p_target_date
      where id = p_plan_id
      returning id into v_id;
    -- RLS makes another user's (or a missing) plan update zero rows.
    if v_id is null then
      raise exception 'plan not found or not yours';
    end if;
  end if;

  if array_length(p_delete_ids, 1) is not null then
    delete from public.study_plan_topics
      where study_plan_id = v_id and topic_id = any(p_delete_ids);
  end if;

  if array_length(p_insert_ids, 1) is not null then
    insert into public.study_plan_topics (study_plan_id, topic_id, completed)
      select v_id, unnest(p_insert_ids), false
      on conflict (study_plan_id, topic_id) do nothing;
  end if;

  return v_id;
end;
$$;

-- Only signed-in users may call it; anon has no auth.uid().
revoke execute on function public.save_study_plan(uuid, text, jsonb, date, text[], text[]) from public, anon;
grant execute on function public.save_study_plan(uuid, text, jsonb, date, text[], text[]) to authenticated;
```

- [ ] **Step 2: Hand the migration to the human to apply**

The human applies migrations against their Supabase project. Tell them: "Apply `supabase/migrations/20260719000001_plan_editing.sql`, then reply done." Do not proceed to Task 5's runtime verification until they confirm.

- [ ] **Step 3: Provide a verification query**

After they apply it, they can confirm the objects exist by running:

```sql
select proname from pg_proc where proname = 'save_study_plan';
select polcmd from pg_policy where polrelid = 'public.study_plan_topics'::regclass;
```

Expected: one `save_study_plan` row; `polcmd` includes `d` (delete) among `r`/`a`/`w`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260719000001_plan_editing.sql
git commit -m "feat(db): delete policy + transactional save_study_plan RPC for plan editing"
```

---

## Task 2: Plan types + pure topic-id helpers (normalize / collect / diff)

**Files:**
- Create: `src/lib/plan/types.ts`
- Create: `src/lib/plan/reconcile.ts`
- Test: `src/lib/plan/reconcile.test.ts`

**Interfaces:**
- Produces:
  - `EditableTopic = { id: string; title: string; description: string; estimatedHours: number }`
  - `EditableWeek = { weekNumber: number; title: string; estimatedHours: number; hasPracticeExam: boolean; isReviewWeek: boolean; resourceIds: string[]; topics: EditableTopic[] }`
  - `EditablePlan = { summary?: string; recommended?: boolean; weeks: EditableWeek[] }`
  - `normalizeWeeks(weeks: EditableWeek[]): EditableWeek[]` — returns a copy with `weekNumber` renumbered 1..N in array order.
  - `collectTopicIds(plan: EditablePlan): string[]` — every topic id, in order; **throws `Error('duplicate topic id')`** if any id repeats.
  - `planTopicDiff(currentIds: string[], desiredIds: string[]): { toInsert: string[]; toDelete: string[]; survivors: string[] }`.

- [ ] **Step 1: Write the types file**

Create `src/lib/plan/types.ts` (no imports — runs under `node --test` and ships to the client):

```ts
// The stored-jsonb shape of a plan, matching what the advisor's planSchema emits
// and what study_plans.plan already holds. Kept separate from the richer runtime
// StudyWeek/StudyTopic in lib/types.ts, which carry completion and resolved
// resources that the jsonb deliberately does not.
export type EditableTopic = {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
};

export type EditableWeek = {
  weekNumber: number;
  title: string;
  estimatedHours: number;
  hasPracticeExam: boolean;
  isReviewWeek: boolean;
  resourceIds: string[];
  topics: EditableTopic[];
};

export type EditablePlan = {
  summary?: string;
  recommended?: boolean;
  weeks: EditableWeek[];
};
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/plan/reconcile.test.ts`:

```ts
// Run: node --test src/lib/plan/reconcile.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeeks, collectTopicIds, planTopicDiff } from './reconcile.ts';
import type { EditableWeek, EditablePlan } from './types.ts';

const week = (over: Partial<EditableWeek>): EditableWeek => ({
  weekNumber: 1,
  title: 'W',
  estimatedHours: 1,
  hasPracticeExam: false,
  isReviewWeek: false,
  resourceIds: [],
  topics: [],
  ...over,
});

test('normalizeWeeks renumbers to sequential 1..N in array order', () => {
  const out = normalizeWeeks([week({ weekNumber: 9 }), week({ weekNumber: 3 }), week({ weekNumber: 40 })]);
  assert.deepEqual(out.map((w) => w.weekNumber), [1, 2, 3]);
});

test('collectTopicIds returns every id in order', () => {
  const plan: EditablePlan = {
    weeks: [
      week({ topics: [{ id: 'a', title: 't', description: '', estimatedHours: 1 }] }),
      week({ topics: [{ id: 'b', title: 't', description: '', estimatedHours: 1 }] }),
    ],
  };
  assert.deepEqual(collectTopicIds(plan), ['a', 'b']);
});

test('collectTopicIds throws on a duplicate id', () => {
  const plan: EditablePlan = {
    weeks: [
      week({ topics: [{ id: 'a', title: 't', description: '', estimatedHours: 1 }] }),
      week({ topics: [{ id: 'a', title: 't', description: '', estimatedHours: 1 }] }),
    ],
  };
  assert.throws(() => collectTopicIds(plan), /duplicate topic id/);
});

test('planTopicDiff: added insert, removed delete, survivors kept', () => {
  const d = planTopicDiff(['a', 'b', 'c'], ['b', 'c', 'x']);
  assert.deepEqual(d.toInsert, ['x']);
  assert.deepEqual(d.toDelete.sort(), ['a']);
  assert.deepEqual(d.survivors.sort(), ['b', 'c']);
});

test('planTopicDiff: a new plan (empty current) inserts everything', () => {
  const d = planTopicDiff([], ['a', 'b']);
  assert.deepEqual(d.toInsert, ['a', 'b']);
  assert.deepEqual(d.toDelete, []);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test src/lib/plan/reconcile.test.ts`
Expected: FAIL — `Cannot find module './reconcile.ts'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/plan/reconcile.ts`:

```ts
import type { EditableWeek, EditablePlan } from './types.ts';

/** Renumber weeks 1..N in array order, so reordering leaves clean numbers. */
export function normalizeWeeks(weeks: EditableWeek[]): EditableWeek[] {
  return weeks.map((w, i) => ({ ...w, weekNumber: i + 1 }));
}

/** Every topic id, in order. Throws on a duplicate — the DB has a unique
 *  constraint and a plan with two rows claiming one id cannot be saved. */
export function collectTopicIds(plan: EditablePlan): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const w of plan.weeks) {
    for (const t of w.topics) {
      if (seen.has(t.id)) throw new Error(`duplicate topic id: ${t.id}`);
      seen.add(t.id);
      ids.push(t.id);
    }
  }
  return ids;
}

/** Set difference for reconciliation: what to insert, delete, and leave alone. */
export function planTopicDiff(
  currentIds: string[],
  desiredIds: string[]
): { toInsert: string[]; toDelete: string[]; survivors: string[] } {
  const current = new Set(currentIds);
  const desired = new Set(desiredIds);
  return {
    toInsert: desiredIds.filter((id) => !current.has(id)),
    toDelete: currentIds.filter((id) => !desired.has(id)),
    survivors: desiredIds.filter((id) => current.has(id)),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test src/lib/plan/reconcile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan/types.ts src/lib/plan/reconcile.ts src/lib/plan/reconcile.test.ts
git commit -m "feat(plan): editable plan types + pure topic-id reconcile helpers"
```

---

## Task 3: Save-validation and request schemas

**Files:**
- Create: `src/lib/plan/schema.ts`
- Test: `src/lib/plan/schema.test.ts`

**Interfaces:**
- Consumes: `EditablePlan` from `./types.ts`.
- Produces:
  - `storedPlanSchema` — Zod for `{ summary?, recommended?, weeks: [...] }` (the jsonb shape).
  - `savePlanSchema` — Zod for the `savePlan` input: `{ planId?: uuid, certId, summary?, recommended?, targetDate?, weeks }`, weeks 1–104, ≥1 topic overall, unique non-empty topic ids, non-negative hours.
  - `editRequestSchema` — Zod for the advisor-edit body: `{ certId, locale, instruction, plan }`.
  - Types `SavePlanInput = z.infer<typeof savePlanSchema> & { lang: string }`, `StoredPlanInput = z.infer<typeof storedPlanSchema>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/plan/schema.test.ts`:

```ts
// Run: node --test src/lib/plan/schema.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savePlanSchema } from './schema.ts';

const topic = (id: string) => ({ id, title: 'T', description: 'd', estimatedHours: 2 });
const week = (topics: ReturnType<typeof topic>[]) => ({
  weekNumber: 1,
  title: 'Week',
  estimatedHours: 4,
  hasPracticeExam: false,
  isReviewWeek: false,
  resourceIds: [],
  topics,
});
const base = (over = {}) => ({ certId: 'aws-saa', weeks: [week([topic('a')])], ...over });

test('a minimal valid plan parses', () => {
  assert.equal(savePlanSchema.safeParse(base()).success, true);
});

test('rejects a plan with no topics at all', () => {
  assert.equal(savePlanSchema.safeParse(base({ weeks: [week([])] })).success, false);
});

test('rejects duplicate topic ids across weeks', () => {
  const bad = base({ weeks: [week([topic('a')]), week([topic('a')])] });
  assert.equal(savePlanSchema.safeParse(bad).success, false);
});

test('rejects negative estimatedHours', () => {
  const bad = base({ weeks: [week([{ ...topic('a'), estimatedHours: -1 }])] });
  assert.equal(savePlanSchema.safeParse(bad).success, false);
});

test('rejects more than 104 weeks', () => {
  const many = Array.from({ length: 105 }, (_, i) => week([topic(`t${i}`)]));
  assert.equal(savePlanSchema.safeParse(base({ weeks: many })).success, false);
});

test('rejects an empty topic id', () => {
  assert.equal(savePlanSchema.safeParse(base({ weeks: [week([topic('')])] })).success, false);
});

test('accepts an optional YYYY-MM-DD target date and rejects garbage', () => {
  assert.equal(savePlanSchema.safeParse(base({ targetDate: '2026-09-01' })).success, true);
  assert.equal(savePlanSchema.safeParse(base({ targetDate: 'soon' })).success, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/plan/schema.test.ts`
Expected: FAIL — `Cannot find module './schema.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/plan/schema.ts`:

```ts
import { z } from 'zod';

const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  estimatedHours: z.number().min(0),
});

const weekSchema = z.object({
  weekNumber: z.number().int().min(1),
  title: z.string().min(1),
  estimatedHours: z.number().min(0),
  hasPracticeExam: z.boolean(),
  isReviewWeek: z.boolean(),
  resourceIds: z.array(z.string()),
  topics: z.array(topicSchema),
});

/** The plan jsonb shape (also what the advisor-edit body carries). */
export const storedPlanSchema = z.object({
  summary: z.string().optional(),
  recommended: z.boolean().optional(),
  weeks: z.array(weekSchema).min(1).max(104),
});

const atLeastOneTopic = (p: { weeks: { topics: unknown[] }[] }) =>
  p.weeks.some((w) => w.topics.length > 0);

const uniqueTopicIds = (p: { weeks: { topics: { id: string }[] }[] }) => {
  const ids = p.weeks.flatMap((w) => w.topics.map((t) => t.id));
  return new Set(ids).size === ids.length;
};

/** Input to the savePlan action — a trust boundary; the body comes from a browser. */
export const savePlanSchema = storedPlanSchema
  .extend({
    planId: z.string().uuid().optional(),
    certId: z.string().min(1).max(100),
    // '' from an empty <input type="date">, or a real date. Never a partial.
    targetDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  })
  .refine(atLeastOneTopic, { message: 'A plan needs at least one topic.' })
  .refine(uniqueTopicIds, { message: 'Topic ids must be unique.' });

export const editRequestSchema = z.object({
  certId: z.string().min(1).max(100),
  locale: z.enum(['en', 'ar']),
  instruction: z.string().min(1).max(2000),
  plan: storedPlanSchema,
});

export type StoredPlanInput = z.infer<typeof storedPlanSchema>;
export type SavePlanInput = z.infer<typeof savePlanSchema> & { lang: string };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/plan/schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan/schema.ts src/lib/plan/schema.test.ts
git commit -m "feat(plan): zod schemas for save + advisor-edit, with bounds and id rules"
```

---

## Task 4: AI-edit topic-id matching

**Files:**
- Modify: `src/lib/plan/reconcile.ts` (add `matchTopicIds`)
- Test: `src/lib/plan/reconcile.test.ts` (extend)

**Interfaces:**
- Consumes: `EditablePlan` from `./types.ts`.
- Produces: `matchTopicIds(original: EditablePlan, revised: EditablePlan): EditablePlan` — returns `revised` with each topic's `id` set to the matching original topic's id (matched by normalized title, disambiguated by normalized description when a title repeats), or a fresh `crypto.randomUUID()` when there is no match. Each original id is reused at most once.

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/plan/reconcile.test.ts`:

```ts
import { matchTopicIds } from './reconcile.ts';

const oneTopicPlan = (id: string, title: string, description = ''): EditablePlan => ({
  weeks: [week({ topics: [{ id, title, description, estimatedHours: 1 }] })],
});

test('matchTopicIds reuses the original id for an unchanged (renamed-case) topic', () => {
  const original = oneTopicPlan('orig-1', 'IAM basics');
  const revised = oneTopicPlan('model-made-this-up', '  iam   basics ');
  const out = matchTopicIds(original, revised);
  assert.equal(out.weeks[0].topics[0].id, 'orig-1');
});

test('matchTopicIds mints a fresh id for a genuinely new topic', () => {
  const original = oneTopicPlan('orig-1', 'IAM basics');
  const revised = oneTopicPlan('anything', 'Brand new topic');
  const out = matchTopicIds(original, revised);
  assert.notEqual(out.weeks[0].topics[0].id, 'orig-1');
  assert.match(out.weeks[0].topics[0].id, /[0-9a-f-]{36}/);
});

test('matchTopicIds never reuses one original id twice', () => {
  const original = oneTopicPlan('orig-1', 'IAM basics');
  const revised: EditablePlan = {
    weeks: [
      week({
        topics: [
          { id: 'x', title: 'IAM basics', description: '', estimatedHours: 1 },
          { id: 'y', title: 'IAM basics', description: '', estimatedHours: 1 },
        ],
      }),
    ],
  };
  const out = matchTopicIds(original, revised);
  const [a, b] = out.weeks[0].topics.map((t) => t.id);
  assert.equal(a, 'orig-1');
  assert.notEqual(b, 'orig-1');
});

test('matchTopicIds disambiguates repeated titles by description', () => {
  const original: EditablePlan = {
    weeks: [
      week({
        topics: [
          { id: 'iam-a', title: 'IAM', description: 'roles', estimatedHours: 1 },
          { id: 'iam-b', title: 'IAM', description: 'policies', estimatedHours: 1 },
        ],
      }),
    ],
  };
  const revised: EditablePlan = {
    weeks: [
      week({
        topics: [
          { id: 'z', title: 'IAM', description: 'policies', estimatedHours: 1 },
        ],
      }),
    ],
  };
  const out = matchTopicIds(original, revised);
  assert.equal(out.weeks[0].topics[0].id, 'iam-b');
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node --test src/lib/plan/reconcile.test.ts`
Expected: FAIL — `matchTopicIds` is not exported.

- [ ] **Step 3: Implement `matchTopicIds`**

Append to `src/lib/plan/reconcile.ts`:

```ts
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Restore original topic ids on an AI-revised plan so completion survives even
 * when the model rewrites identifiers. A revised topic is matched to an original
 * by normalized title; when a title repeats, the one with the matching normalized
 * description wins. Each original id is handed out at most once; anything left
 * unmatched is a genuinely new topic and gets a fresh uuid.
 */
export function matchTopicIds(original: EditablePlan, revised: EditablePlan): EditablePlan {
  // title -> queue of { id, desc } still available to claim.
  const byTitle = new Map<string, { id: string; desc: string }[]>();
  for (const w of original.weeks) {
    for (const t of w.topics) {
      const key = norm(t.title);
      const list = byTitle.get(key) ?? [];
      list.push({ id: t.id, desc: norm(t.description) });
      byTitle.set(key, list);
    }
  }

  const claim = (title: string, description: string): string | undefined => {
    const list = byTitle.get(norm(title));
    if (!list || list.length === 0) return undefined;
    const wantDesc = norm(description);
    let idx = list.findIndex((c) => c.desc === wantDesc);
    if (idx === -1) idx = 0; // title matched, description did not — take the next one
    return list.splice(idx, 1)[0].id;
  };

  return {
    ...revised,
    weeks: revised.weeks.map((w) => ({
      ...w,
      topics: w.topics.map((t) => ({ ...t, id: claim(t.title, t.description) ?? crypto.randomUUID() })),
    })),
  };
}
```

- [ ] **Step 4: Run to verify all reconcile tests pass**

Run: `node --test src/lib/plan/reconcile.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan/reconcile.ts src/lib/plan/reconcile.test.ts
git commit -m "feat(plan): AI-edit topic-id matching to preserve completion"
```

---

## Task 5: `savePlan` server action

**Files:**
- Create: `src/app/[lang]/(app)/plan/actions.ts`

**Interfaces:**
- Consumes: `savePlanSchema`, `SavePlanInput` from `@/lib/plan/schema`; `normalizeWeeks`, `collectTopicIds`, `planTopicDiff` from `@/lib/plan/reconcile`; `createClient` from `@/lib/supabase/server`; `getResourcesForCertification` from `@/lib/data/resources`; the RPC `save_study_plan` from Task 1.
- Produces: `savePlan(input: SavePlanInput): Promise<{ error: string } | void>` — validates, filters resourceIds to the catalog, reconciles, calls the RPC atomically, then `redirect`s to the saved plan on success (returns `{ error }` on validation/DB failure).

- [ ] **Step 1: Write the action**

Create `src/app/[lang]/(app)/plan/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getResourcesForCertification } from '@/lib/data/resources';
import { isLocale } from '@/lib/i18n';
import { savePlanSchema, type SavePlanInput } from '@/lib/plan/schema';
import { normalizeWeeks, collectTopicIds, planTopicDiff } from '@/lib/plan/reconcile';

/**
 * Persist a whole plan and reconcile its topic rows atomically.
 *
 * Shared by the edit page (planId present → update) and the new page (planId
 * absent → insert, so an abandoned draft never leaves an empty plan). The write
 * goes through save_study_plan, which runs the row upsert + topic delete/insert
 * in one transaction — three separate PostgREST calls would each auto-commit and
 * could leave the plan jsonb pointing at topics that were never inserted.
 *
 * Returns { error } for the client to show; redirects on success. No user_id is
 * ever read from the input — the RPC stamps auth.uid(), enforced by RLS.
 */
export async function savePlan(input: SavePlanInput): Promise<{ error: string } | void> {
  if (!isLocale(input.lang)) return { error: 'Invalid request.' };

  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success) return { error: 'Please give every week and topic a title, and check the hours.' };
  const { planId, certId, summary, recommended, targetDate, weeks } = parsed.data;

  const supabase = await createClient();

  // Same guard as plan generation: a week may only reference resources that exist
  // for this certification. Silently drop anything else rather than store a dead id.
  const catalog = await getResourcesForCertification(certId);
  const allowed = new Set(catalog.map((r) => r.id));
  const cleanedWeeks = normalizeWeeks(weeks).map((w) => ({
    ...w,
    resourceIds: [...new Set(w.resourceIds)].filter((id) => allowed.has(id)),
  }));

  const plan = { summary, recommended, weeks: cleanedWeeks };

  let desiredIds: string[];
  try {
    desiredIds = collectTopicIds(plan);
  } catch {
    return { error: 'Two topics share an id. Please try again.' };
  }

  // Current ids are re-read here, not trusted from the client: they only decide
  // which rows to add or remove, and RLS scopes the read to the owner.
  let currentIds: string[] = [];
  if (planId) {
    const { data } = await supabase
      .from('study_plan_topics')
      .select('topic_id')
      .eq('study_plan_id', planId);
    currentIds = (data ?? []).map((r) => r.topic_id as string);
  }
  const { toInsert, toDelete } = planTopicDiff(currentIds, desiredIds);

  const { data: savedId, error } = await supabase.rpc('save_study_plan', {
    p_plan_id: planId ?? null,
    p_certification_id: certId,
    p_plan: plan,
    p_target_date: targetDate ? targetDate : null,
    p_insert_ids: toInsert,
    p_delete_ids: toDelete,
  });

  if (error || !savedId) {
    console.error('savePlan failed:', error?.message);
    return { error: 'Could not save the plan. Please try again.' };
  }

  revalidatePath(`/[lang]/plan/${savedId}`, 'page');
  revalidatePath('/[lang]/dashboard', 'page');
  redirect(`/${input.lang}/plan/${savedId}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (No unit test — the logic pieces are covered in Tasks 2–3; the action is verified end-to-end in Task 9's browser pass.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/[lang]/(app)/plan/actions.ts"
git commit -m "feat(plan): savePlan server action with atomic RPC + resource guard"
```

---

## Task 6: Advisor-edit route (one-shot)

**Files:**
- Create: `src/app/api/advisor/plan/edit/route.ts`

**Interfaces:**
- Consumes: `editRequestSchema` from `@/lib/plan/schema`; `matchTopicIds` from `@/lib/plan/reconcile`; the advisor helpers from `@/lib/ai/advisor`; `rateLimit`; data loaders.
- Produces: `POST` handler → `Response.json({ plan })` where `plan` is a revised `EditablePlan` with original ids restored and resourceIds filtered; `429` on rate limit, `502`/`429` on provider failure via `providerErrorResponse`.

- [ ] **Step 1: Write the route**

Create `src/app/api/advisor/plan/edit/route.ts`:

```ts
import { generateObject } from 'ai';
import { getUser } from '@/lib/supabase/server';
import { getAllCertifications, getCertificationById } from '@/lib/data/certifications';
import { getResourcesForCertification } from '@/lib/data/resources';
import { getProfile } from '@/lib/data/queries';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeAdvisorSettings } from '@/lib/advisor-settings';
import {
  advisorModel,
  knownFacts,
  planPrompt,
  planSchema,
  providerErrorResponse,
  resourcesForBudget,
  systemPrompt,
} from '@/lib/ai/advisor';
import { editRequestSchema } from '@/lib/plan/schema';
import { matchTopicIds } from '@/lib/plan/reconcile';

/**
 * One-shot advisor edit: take the current plan plus a plain-language instruction,
 * return a revised plan the editor previews. Not saved here — the editor's Save
 * (savePlan) is the only writer, so this is a pure transform behind the same tight
 * rate limit as plan generation.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit(user.id, 'plan', 5);
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
          'Retry-After': String(rl.retryAfter),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = editRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'invalid request' }, { status: 400 });
  const { certId, locale, instruction, plan: currentPlan } = parsed.data;

  const [cert, catalog, { profile, skills, languages }] = await Promise.all([
    getCertificationById(certId),
    getAllCertifications(),
    getProfile(),
  ]);
  if (!cert) return Response.json({ error: 'unknown certification' }, { status: 404 });

  const offered = resourcesForBudget(await getResourcesForCertification(cert.id), profile?.budget);
  const settings = normalizeAdvisorSettings(profile?.advisor_settings);

  const prompt = [
    planPrompt(
      cert,
      locale,
      offered,
      { formats: profile?.preferred_resource_formats, sites: profile?.preferred_resource_sites },
      settings
    ),
    '',
    'The learner already has this study plan (JSON):',
    JSON.stringify(currentPlan),
    '',
    `Apply this change and return the FULL revised plan: ${instruction}`,
    "Keep each existing topic's id when the topic is unchanged or only moved. Mint a new id only for a genuinely new topic.",
  ].join('\n');

  let revised;
  try {
    ({ object: revised } = await generateObject({
      model: advisorModel,
      schema: planSchema,
      system: systemPrompt(cert, locale, catalog, knownFacts(profile, skills, languages), settings),
      prompt,
    }));
  } catch (err) {
    console.error('plan edit generation failed:', err);
    return providerErrorResponse(err);
  }

  // Restore original ids (belt-and-suspenders over the prompt), then drop any
  // resource id the model invented — exactly as the plan route does.
  const withIds = matchTopicIds(currentPlan, revised);
  const allowed = new Set(offered.map((r) => r.id));
  withIds.weeks = withIds.weeks.map((w) => ({
    ...w,
    resourceIds: [...new Set(w.resourceIds ?? [])].filter((id) => allowed.has(id)),
  }));

  return Response.json(
    { plan: withIds },
    { headers: { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining) } }
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Core transform `matchTopicIds` is unit-tested in Task 4; the route is exercised in Task 9's browser pass.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/advisor/plan/edit/route.ts
git commit -m "feat(plan): one-shot advisor plan-edit route with id-preserving post-process"
```

---

## Task 7: Dictionary strings for the editor and entry points

**Files:**
- Modify: `src/app/[lang]/dictionaries/en.json`
- Modify: `src/app/[lang]/dictionaries/ar.json`

**Interfaces:**
- Produces: `dict.planEditor.*` (editor UI), `dict.plan.edit` (button), `dict.certification.buildYourself`, `dict.dashboard.newPlan`, `dict.plan.new.*` (picker). Consumed by Tasks 8–9.

- [ ] **Step 1: Add the English strings**

In `src/app/[lang]/dictionaries/en.json`, add an `"edit": "Edit plan"` key inside the existing `"plan"` object (after `"paid"`), and add these new sibling top-level objects (place `planEditor` and `planNew` alphabetically-ish near `plan`):

Inside `"plan"` (after `"paid": "Paid"`):
```json
    "paid": "Paid",
    "edit": "Edit plan",
    "new": {
      "title": "Build a plan",
      "subtitle": "Pick a certification to plan by hand.",
      "pick": "Choose a certification"
    }
```

New top-level `"planEditor"` object:
```json
  "planEditor": {
    "newTitle": "New plan",
    "editTitle": "Edit plan",
    "summary": "Summary",
    "summaryPlaceholder": "A sentence on how this plan is shaped (optional).",
    "targetDate": "Exam target date",
    "week": "Week {n}",
    "weekTitle": "Week title",
    "weekHours": "Hours",
    "reviewWeek": "Review week",
    "practiceExam": "Has practice exam",
    "topicTitle": "Topic",
    "topicDescription": "What to do this session",
    "topicHours": "Hours",
    "addTopic": "Add topic",
    "removeTopic": "Remove topic",
    "addWeek": "Add week",
    "removeWeek": "Remove week",
    "moveUp": "Move up",
    "moveDown": "Move down",
    "duplicateTopic": "Duplicate topic",
    "resources": "Resources",
    "noResources": "No resources in the catalog for this certification.",
    "noTopics": "No topics yet — add one.",
    "save": "Save plan",
    "saving": "Saving",
    "cancel": "Cancel",
    "revise": {
      "title": "Ask the advisor to change it",
      "placeholder": "e.g. compress to 8 weeks, add more hands-on labs",
      "button": "Revise",
      "revising": "Revising",
      "error": "The advisor couldn't revise this. Try again.",
      "quota": "The advisor has hit its daily limit with Google. Try again in {seconds}s."
    },
    "unsaved": {
      "title": "Discard your changes?",
      "body": "You have unsaved edits to this plan.",
      "discard": "Discard changes",
      "keep": "Continue editing"
    }
  }
```

In `"certification"` add (after `"askAdvisor"`):
```json
    "buildYourself": "Build it yourself",
```

In `"dashboard"` add (after `"title"` or near the empty-state block):
```json
    "newPlan": "New plan",
```

- [ ] **Step 2: Add the Arabic strings (same keys)**

In `src/app/[lang]/dictionaries/ar.json`, mirror every key added above:

Inside `"plan"`:
```json
    "paid": "مدفوع",
    "edit": "تعديل الخطة",
    "new": {
      "title": "أنشئ خطة",
      "subtitle": "اختر شهادة لتخطيطها يدويًا.",
      "pick": "اختر شهادة"
    }
```

New `"planEditor"`:
```json
  "planEditor": {
    "newTitle": "خطة جديدة",
    "editTitle": "تعديل الخطة",
    "summary": "الملخص",
    "summaryPlaceholder": "جملة عن طريقة تنظيم هذه الخطة (اختياري).",
    "targetDate": "تاريخ الاختبار المستهدف",
    "week": "الأسبوع {n}",
    "weekTitle": "عنوان الأسبوع",
    "weekHours": "الساعات",
    "reviewWeek": "أسبوع مراجعة",
    "practiceExam": "يتضمن اختبارًا تجريبيًا",
    "topicTitle": "الموضوع",
    "topicDescription": "ما ستفعله في هذه الجلسة",
    "topicHours": "الساعات",
    "addTopic": "إضافة موضوع",
    "removeTopic": "حذف الموضوع",
    "addWeek": "إضافة أسبوع",
    "removeWeek": "حذف الأسبوع",
    "moveUp": "تحريك لأعلى",
    "moveDown": "تحريك لأسفل",
    "duplicateTopic": "تكرار الموضوع",
    "resources": "المصادر",
    "noResources": "لا توجد مصادر في الفهرس لهذه الشهادة.",
    "noTopics": "لا مواضيع بعد — أضف واحدًا.",
    "save": "حفظ الخطة",
    "saving": "جارٍ الحفظ",
    "cancel": "إلغاء",
    "revise": {
      "title": "اطلب من المستشار تعديلها",
      "placeholder": "مثال: اختصرها إلى 8 أسابيع، أضف تدريبات عملية أكثر",
      "button": "تعديل",
      "revising": "جارٍ التعديل",
      "error": "تعذّر على المستشار التعديل. حاول مرة أخرى.",
      "quota": "بلغ المستشار حدّه اليومي لدى Google. حاول بعد {seconds} ثانية."
    },
    "unsaved": {
      "title": "تجاهل تغييراتك؟",
      "body": "لديك تعديلات غير محفوظة على هذه الخطة.",
      "discard": "تجاهل التغييرات",
      "keep": "متابعة التعديل"
    }
  }
```

In `"certification"`:
```json
    "buildYourself": "أنشئها بنفسك",
```

In `"dashboard"`:
```json
    "newPlan": "خطة جديدة",
```

- [ ] **Step 3: Verify JSON parses and keys are at parity**

Run:
```bash
node -e "const fs=require('fs');const en=JSON.parse(fs.readFileSync('src/app/[lang]/dictionaries/en.json','utf8'));const ar=JSON.parse(fs.readFileSync('src/app/[lang]/dictionaries/ar.json','utf8'));const keys=(o,p='')=>Object.keys(o).flatMap(k=>{const kp=p?p+'.'+k:k;return o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k])?[kp,...keys(o[k],kp)]:[kp]});const ek=new Set(keys(en)),ak=new Set(keys(ar));const mA=[...ek].filter(k=>!ak.has(k)),mE=[...ak].filter(k=>!ek.has(k));console.log(mA.length||mE.length?('FAIL missing ar:'+mA+' missing en:'+mE):'PARITY OK '+ek.size);"
```
Expected: `PARITY OK <n>`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[lang]/dictionaries/en.json" "src/app/[lang]/dictionaries/ar.json"
git commit -m "i18n: plan editor + entry-point strings (en/ar)"
```

---

## Task 8: `PlanEditor` client component

**Files:**
- Create: `src/components/app/plan-editor.tsx`

**Interfaces:**
- Consumes: `savePlan` from `@/app/[lang]/(app)/plan/actions`; `normalizeWeeks` from `@/lib/plan/reconcile`; `EditablePlan`, `EditableWeek`, `EditableTopic` from `@/lib/plan/types`; `LearningResource` from `@/lib/types`; `Button` from `@/components/ui/button`; `interpolate` from `@/lib/utils`; the advisor-edit route `POST /api/advisor/plan/edit`.
- Produces: `PlanEditor` component (default not; named export) taking `{ lang, certId, planId?, initialPlan, catalog, labels }`.

- [ ] **Step 1: Write the component**

Create `src/components/app/plan-editor.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { interpolate } from '@/lib/utils';
import { normalizeWeeks } from '@/lib/plan/reconcile';
import { savePlan } from '@/app/[lang]/(app)/plan/actions';
import type { Locale } from '@/lib/i18n';
import type { LearningResource } from '@/lib/types';
import type { EditablePlan, EditableWeek, EditableTopic } from '@/lib/plan/types';

type Labels = {
  newTitle: string; editTitle: string; summary: string; summaryPlaceholder: string;
  targetDate: string; week: string; weekTitle: string; weekHours: string;
  reviewWeek: string; practiceExam: string; topicTitle: string; topicDescription: string;
  topicHours: string; addTopic: string; removeTopic: string; addWeek: string;
  removeWeek: string; moveUp: string; moveDown: string; duplicateTopic: string;
  resources: string; noResources: string; noTopics: string; save: string; saving: string;
  cancel: string;
  revise: { title: string; placeholder: string; button: string; revising: string; error: string; quota: string };
  unsaved: { title: string; body: string; discard: string; keep: string };
};

const emptyTopic = (): EditableTopic => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  estimatedHours: 1,
});

const emptyWeek = (n: number, title: string): EditableWeek => ({
  weekNumber: n,
  title,
  estimatedHours: 0,
  hasPracticeExam: false,
  isReviewWeek: false,
  resourceIds: [],
  topics: [emptyTopic()],
});

export function PlanEditor({
  lang,
  certId,
  planId,
  initialPlan,
  initialTargetDate,
  catalog,
  labels,
}: {
  lang: Locale;
  certId: string;
  planId?: string;
  initialPlan: EditablePlan;
  /** study_plans.target_date — a row field, not part of the plan jsonb. */
  initialTargetDate?: string;
  catalog: LearningResource[];
  labels: Labels;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<EditablePlan>(initialPlan);
  const [targetDate, setTargetDate] = useState(initialTargetDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // The snapshot at mount; the draft is "dirty" when the plan or the target date
  // no longer matches what was loaded.
  const initialJson = useRef(JSON.stringify(initialPlan));
  const dirty =
    JSON.stringify(plan) !== initialJson.current || targetDate !== (initialTargetDate ?? '');

  // Mutating helpers keep weekNumber sequential so display and save agree.
  const setWeeks = (weeks: EditableWeek[]) => setPlan((p) => ({ ...p, weeks: normalizeWeeks(weeks) }));
  const patchWeek = (i: number, patch: Partial<EditableWeek>) =>
    setWeeks(plan.weeks.map((w, wi) => (wi === i ? { ...w, ...patch } : w)));
  const patchTopic = (wi: number, ti: number, patch: Partial<EditableTopic>) =>
    patchWeek(wi, {
      topics: plan.weeks[wi].topics.map((t, i) => (i === ti ? { ...t, ...patch } : t)),
    });
  const move = <T,>(arr: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= arr.length) return arr;
    const copy = [...arr];
    const [x] = copy.splice(from, 1);
    copy.splice(to, 0, x);
    return copy;
  };

  async function onSave() {
    setError(undefined);
    setSaving(true);
    // savePlan redirects on success; only failures return here.
    const res = await savePlan({
      lang,
      planId,
      certId,
      summary: plan.summary,
      recommended: plan.recommended,
      targetDate, // '' clears the date; the schema accepts '' or YYYY-MM-DD
      weeks: plan.weeks,
    });
    if (res && 'error' in res) {
      setError(res.error);
      setSaving(false);
    }
  }

  async function onRevise() {
    const text = instruction.trim();
    if (!text || revising) return;
    setReviseError(undefined);
    setRevising(true);
    try {
      const r = await fetch('/api/advisor/plan/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ certId, locale: lang, instruction: text, plan }),
      });
      if (!r.ok) {
        if (r.status === 429) {
          const b = await r.json().catch(() => ({}));
          setReviseError(interpolate(labels.revise.quota, { seconds: String(Number(b?.retryAfter) || 0) }));
        } else {
          setReviseError(labels.revise.error);
        }
        return;
      }
      const { plan: revised } = (await r.json()) as { plan: EditablePlan };
      setPlan({ ...revised, weeks: normalizeWeeks(revised.weeks) });
      setInstruction('');
    } catch {
      setReviseError(labels.revise.error);
    } finally {
      setRevising(false);
    }
  }

  function onCancel() {
    if (dirty) setConfirmDiscard(true);
    else router.back();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {planId ? labels.editTitle : labels.newTitle}
      </h1>

      {/* Summary + target date */}
      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{labels.summary}</span>
          <textarea
            value={plan.summary ?? ''}
            onChange={(e) => setPlan((p) => ({ ...p, summary: e.target.value }))}
            placeholder={labels.summaryPlaceholder}
            rows={2}
            className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{labels.targetDate}</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="h-10 w-56 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
          />
        </label>
      </div>

      {/* Weeks */}
      <div className="mt-8 flex flex-col gap-6">
        {plan.weeks.map((week, wi) => (
          <section key={wi} className="rounded-lg border border-rule bg-paper-raised p-5">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-3">
              <span className="tabular font-display text-sm font-semibold text-accent">
                {interpolate(labels.week, { n: String(week.weekNumber) })}
              </span>
              <div className="flex items-center gap-1">
                <IconBtn label={labels.moveUp} onClick={() => setWeeks(move(plan.weeks, wi, wi - 1))}>↑</IconBtn>
                <IconBtn label={labels.moveDown} onClick={() => setWeeks(move(plan.weeks, wi, wi + 1))}>↓</IconBtn>
                <IconBtn label={labels.removeWeek} onClick={() => setWeeks(plan.weeks.filter((_, i) => i !== wi))}>✕</IconBtn>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              <input
                aria-label={labels.weekTitle}
                value={week.title}
                onChange={(e) => patchWeek(wi, { title: e.target.value })}
                placeholder={labels.weekTitle}
                className="h-9 min-w-56 flex-1 rounded-md border border-rule bg-paper px-3 text-sm text-ink"
              />
              <input
                aria-label={labels.weekHours}
                type="number"
                min={0}
                value={week.estimatedHours}
                onChange={(e) => patchWeek(wi, { estimatedHours: Number(e.target.value) })}
                className="tabular h-9 w-20 rounded-md border border-rule bg-paper px-3 text-sm text-ink"
              />
              <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                <input type="checkbox" checked={week.isReviewWeek} onChange={(e) => patchWeek(wi, { isReviewWeek: e.target.checked })} />
                {labels.reviewWeek}
              </label>
              <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                <input type="checkbox" checked={week.hasPracticeExam} onChange={(e) => patchWeek(wi, { hasPracticeExam: e.target.checked })} />
                {labels.practiceExam}
              </label>
            </div>

            {/* Topics */}
            <ul className="mt-4 flex flex-col gap-3">
              {week.topics.length === 0 && <li className="text-xs text-ink-faint">{labels.noTopics}</li>}
              {week.topics.map((topic, ti) => (
                <li key={topic.id} className="rounded-md border border-rule/60 bg-paper p-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      aria-label={labels.topicTitle}
                      value={topic.title}
                      onChange={(e) => patchTopic(wi, ti, { title: e.target.value })}
                      placeholder={labels.topicTitle}
                      className="h-9 min-w-48 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink"
                    />
                    <input
                      aria-label={labels.topicHours}
                      type="number"
                      min={0}
                      value={topic.estimatedHours}
                      onChange={(e) => patchTopic(wi, ti, { estimatedHours: Number(e.target.value) })}
                      className="tabular h-9 w-20 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink"
                    />
                    <IconBtn label={labels.moveUp} onClick={() => patchWeek(wi, { topics: move(week.topics, ti, ti - 1) })}>↑</IconBtn>
                    <IconBtn label={labels.moveDown} onClick={() => patchWeek(wi, { topics: move(week.topics, ti, ti + 1) })}>↓</IconBtn>
                    <IconBtn
                      label={labels.duplicateTopic}
                      onClick={() =>
                        patchWeek(wi, {
                          topics: [
                            ...week.topics.slice(0, ti + 1),
                            { ...topic, id: crypto.randomUUID() },
                            ...week.topics.slice(ti + 1),
                          ],
                        })
                      }
                    >⧉</IconBtn>
                    <IconBtn label={labels.removeTopic} onClick={() => patchWeek(wi, { topics: week.topics.filter((_, i) => i !== ti) })}>✕</IconBtn>
                  </div>
                  <textarea
                    aria-label={labels.topicDescription}
                    value={topic.description}
                    onChange={(e) => patchTopic(wi, ti, { description: e.target.value })}
                    placeholder={labels.topicDescription}
                    rows={2}
                    className="mt-2 w-full rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                  />
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => patchWeek(wi, { topics: [...week.topics, emptyTopic()] })}
              className="mt-3 text-sm font-medium text-accent hover:underline"
            >
              + {labels.addTopic}
            </button>

            {/* Resource picker */}
            <ResourcePicker
              catalog={catalog}
              selected={week.resourceIds}
              onToggle={(id) =>
                patchWeek(wi, {
                  resourceIds: week.resourceIds.includes(id)
                    ? week.resourceIds.filter((x) => x !== id)
                    : [...week.resourceIds, id],
                })
              }
              labels={{ title: labels.resources, empty: labels.noResources }}
            />
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setWeeks([...plan.weeks, emptyWeek(plan.weeks.length + 1, interpolate(labels.week, { n: String(plan.weeks.length + 1) }))])}
        className="mt-6 rounded-md border border-rule bg-paper-raised px-4 py-2 text-sm font-medium text-ink hover:border-rule-strong"
      >
        + {labels.addWeek}
      </button>

      {/* Revise with advisor */}
      <section className="mt-10 rounded-lg border border-rule bg-paper-sunken p-5">
        <h2 className="text-sm font-semibold text-ink">{labels.revise.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={labels.revise.placeholder}
            disabled={revising}
            maxLength={2000}
            className="h-10 min-w-64 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint"
          />
          <Button type="button" variant="secondary" onClick={onRevise} disabled={revising || !instruction.trim()}>
            {revising ? labels.revise.revising : labels.revise.button}
          </Button>
        </div>
        {reviseError && <p role="alert" className="mt-2 text-sm text-danger">{reviseError}</p>}
      </section>

      {/* Save / cancel */}
      {error && <p role="alert" className="mt-6 rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? labels.saving : labels.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{labels.cancel}</Button>
      </div>

      {confirmDiscard && (
        <ConfirmDialog
          labels={labels.unsaved}
          onKeep={() => setConfirmDiscard(false)}
          onDiscard={() => router.back()}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-rule bg-paper text-ink-muted hover:border-rule-strong hover:text-ink"
    >
      {children}
    </button>
  );
}

function ResourcePicker({
  catalog,
  selected,
  onToggle,
  labels,
}: {
  catalog: { id: string; title: string; provider: string; free: boolean }[];
  selected: string[];
  onToggle: (id: string) => void;
  labels: { title: string; empty: string };
}) {
  return (
    <section className="mt-4 border-t border-rule pt-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">{labels.title}</h3>
      {catalog.length === 0 ? (
        <p className="mt-2 text-xs text-ink-faint">{labels.empty}</p>
      ) : (
        <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
          {catalog.map((r) => (
            <li key={r.id}>
              <label className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm text-ink">
                <input type="checkbox" checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} />
                <span className="truncate">{r.title}</span>
                <span className="ms-auto shrink-0 text-xs text-ink-faint">{r.provider}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConfirmDialog({
  labels,
  onKeep,
  onDiscard,
}: {
  labels: { title: string; body: string; discard: string; keep: string };
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg border border-rule bg-paper-raised p-6 shadow-float">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{labels.body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onKeep}>{labels.keep}</Button>
          <Button type="button" onClick={onDiscard}>{labels.discard}</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/app/plan-editor.tsx`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/app/plan-editor.tsx
git commit -m "feat(plan): PlanEditor client component (edit, resources, revise, unsaved guard)"
```

---

## Task 9: RSC pages — edit, new, and the certification picker

**Files:**
- Create: `src/app/[lang]/(app)/plan/[planId]/edit/page.tsx`
- Create: `src/app/[lang]/(app)/plan/new/[certId]/page.tsx`
- Create: `src/app/[lang]/(app)/plan/new/page.tsx`

**Interfaces:**
- Consumes: `getPlan`, `getResourcesForCertification`, `getAllCertifications`, `getCertificationById`, `getDictionary`, `PlanEditor`.
- Produces: three routes wiring `PlanEditor` (edit + new) and a cert picker.

- [ ] **Step 1: Edit page**

Create `src/app/[lang]/(app)/plan/[planId]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getDictionary } from '../../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getPlan } from '@/lib/data/queries';
import { getResourcesForCertification } from '@/lib/data/resources';
import { PlanEditor } from '@/components/app/plan-editor';
import type { EditablePlan } from '@/lib/plan/types';

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ lang: string; planId: string }>;
}) {
  const { lang, planId } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, plan] = await Promise.all([getDictionary(lang), getPlan(planId)]);
  if (!plan) notFound();

  const catalog = await getResourcesForCertification(plan.row.certification_id);

  const initialPlan: EditablePlan = {
    summary: plan.row.plan?.summary,
    recommended: plan.row.plan?.recommended,
    weeks: (plan.row.plan?.weeks ?? []).map((w) => ({
      weekNumber: w.weekNumber,
      title: w.title,
      estimatedHours: w.estimatedHours,
      hasPracticeExam: w.hasPracticeExam,
      isReviewWeek: w.isReviewWeek,
      resourceIds: w.resourceIds ?? [],
      topics: w.topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        estimatedHours: t.estimatedHours,
      })),
    })),
  };

  return (
    <PlanEditor
      lang={lang}
      certId={plan.row.certification_id}
      planId={plan.row.id}
      initialPlan={initialPlan}
      initialTargetDate={plan.row.target_date ?? ''}
      catalog={catalog}
      labels={dict.planEditor}
    />
  );
}
```

- [ ] **Step 2: New-plan page (blank)**

Create `src/app/[lang]/(app)/plan/new/[certId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getDictionary } from '../../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getCertificationById } from '@/lib/data/certifications';
import { getResourcesForCertification } from '@/lib/data/resources';
import { PlanEditor } from '@/components/app/plan-editor';

export default async function NewPlanPage({
  params,
}: {
  params: Promise<{ lang: string; certId: string }>;
}) {
  const { lang, certId } = await params;
  if (!isLocale(lang)) notFound();

  const cert = await getCertificationById(certId);
  if (!cert) notFound();
  const catalog = await getResourcesForCertification(cert.id);
  const dict = await getDictionary(lang);

  return (
    <PlanEditor
      lang={lang}
      certId={cert.id}
      initialPlan={{ weeks: [], summary: '', recommended: true }}
      catalog={catalog}
      labels={dict.planEditor}
    />
  );
}
```

- [ ] **Step 3: Certification picker**

Create `src/app/[lang]/(app)/plan/new/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getAllCertifications } from '@/lib/data/certifications';

export default async function PickCertForPlanPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const [dict, certs] = await Promise.all([getDictionary(lang), getAllCertifications()]);
  const t = dict.plan.new;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
      <p className="mt-2 text-ink-muted">{t.subtitle}</p>

      <ul className="mt-8 flex flex-col divide-y divide-rule border-y border-rule">
        {certs.map((c) => (
          <li key={c.id}>
            <Link
              href={`/${lang}/plan/new/${c.id}`}
              className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-accent"
            >
              <span className="font-medium text-ink">{c.name}</span>
              <span className="text-xs text-ink-faint">{c.provider}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit && npx next build`
Expected: exit 0; the route list includes `/[lang]/plan/[planId]/edit`, `/[lang]/plan/new`, `/[lang]/plan/new/[certId]`.

- [ ] **Step 5: Browser-verify the create flow (needs Task 1 applied)**

Run `npm run dev`. Signed in, visit `/en/plan/new`, pick a certification, add a week + topic, pick a resource, set a target date, Save. Expect a redirect to `/en/plan/<id>` showing the plan. Confirm the row exists and topic rows were created (dashboard shows the new plan). Repeat on `/ar/...` to confirm RTL.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[lang]/(app)/plan/[planId]/edit/page.tsx" "src/app/[lang]/(app)/plan/new/[certId]/page.tsx" "src/app/[lang]/(app)/plan/new/page.tsx"
git commit -m "feat(plan): edit, new, and picker RSC pages wiring PlanEditor"
```

---

## Task 10: Entry points + full verification

**Files:**
- Modify: `src/app/[lang]/(app)/plan/[planId]/page.tsx`
- Modify: `src/app/[lang]/(app)/certification/[id]/page.tsx`
- Modify: `src/app/[lang]/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `dict.plan.edit`, `dict.certification.buildYourself`, `dict.dashboard.newPlan`, `ButtonLink`.

- [ ] **Step 1: Edit button on the plan page**

In `src/app/[lang]/(app)/plan/[planId]/page.tsx`, import `ButtonLink` (`import { ButtonLink } from '@/components/ui/button';`) and add it in the header, right after the closing `</div>` of the progress bar block and before the header closes (`</header>`):

```tsx
        <div className="mt-5">
          <ButtonLink href={`/${lang}/plan/${plan.row.id}/edit`} variant="secondary" size="sm">
            {t.edit}
          </ButtonLink>
        </div>
```

(`t` is already `dict.plan` in that file.)

- [ ] **Step 2: "Build it yourself" on the certification page**

In `src/app/[lang]/(app)/certification/[id]/page.tsx`, in the actions row that currently holds "Ask the advisor" and the provider link, add a secondary link between them:

```tsx
          <ButtonLink href={`/${lang}/advisor/${cert.id}`} size="lg">
            {t.askAdvisor}
          </ButtonLink>
          <ButtonLink href={`/${lang}/plan/new/${cert.id}`} variant="secondary" size="lg">
            {t.buildYourself}
          </ButtonLink>
          <ButtonLink href={cert.officialUrl} variant="link" target="_blank" rel="noopener noreferrer">
            {cert.provider} ↗
          </ButtonLink>
```

- [ ] **Step 3: "New plan" on the dashboard**

In `src/app/[lang]/(app)/dashboard/page.tsx`, import `ButtonLink` and add it next to the page title in BOTH the empty-state branch and the main branch. Replace the empty-state `<h1>` block:

```tsx
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
          <ButtonLink href={`/${lang}/plan/new`} size="sm">{t.newPlan}</ButtonLink>
        </div>
```

and the main-branch `<h1>` the same way (wrap in the same flex row with the button).

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit && npx eslint . && npx next build`
Expected: all exit 0.

- [ ] **Step 5: Full manual verification (three flows, both locales)**

With Task 1's migration applied and `npm run dev` running, signed in:
1. **Direct edit + completion preservation:** open an advisor-made plan, tick a topic complete, click **Edit plan**, rename a different topic, remove one topic, add one, reorder a week, Save. Confirm: redirect to the plan; the ticked topic is **still complete**; the removed topic is gone; the dashboard progress denominator changed.
2. **Create without advisor:** dashboard → **New plan** → pick cert → build → Save → plan renders.
3. **Advisor edit:** in the editor, type "compress to 6 weeks" → **Revise** → the draft updates → tick had-been-complete survives (ids preserved) → Save.
4. Repeat flow 2 on `/ar` and confirm RTL mirrors (controls on the correct side, Arabic labels).

- [ ] **Step 6: Full gate + commit**

Run the whole gate: `npx tsc --noEmit && npm test && npx eslint . && npx next build`, and the dict-parity check from Task 7 Step 3. All green.

```bash
git add "src/app/[lang]/(app)/plan/[planId]/page.tsx" "src/app/[lang]/(app)/certification/[id]/page.tsx" "src/app/[lang]/(app)/dashboard/page.tsx"
git commit -m "feat(plan): entry points for edit, build-your-own, and new plan"
```

---

## Self-Review (completed during authoring)

**Spec coverage:** direct edit (Tasks 5,8,9,10) · create without advisor (Tasks 8,9,10) · advisor edit (Tasks 4,6,8) · transactional save (Task 1 RPC + Task 5) · DELETE policy migration (Task 1) · topic reconciliation preserving completion (Tasks 2,5) · AI-edit id matching (Tasks 4,6) · unsaved-changes guard (Task 8) · resource picker (Task 8) · validation incl. ≥1 topic / non-negative hours / renumbered weekNumber / ignored user_id (Tasks 1,3,5) · target date (Tasks 5,8,9) · i18n parity (Task 7) · tests (Tasks 2,3,4) · entry points (Task 10). No gaps.

**Type consistency:** `EditablePlan/EditableWeek/EditableTopic` used identically across `types.ts`, `reconcile.ts`, `schema.ts`, `plan-editor.tsx`, and the pages. `savePlan(SavePlanInput)` matches the editor's call and `savePlanSchema`. RPC arg names (`p_plan_id`, `p_certification_id`, `p_plan`, `p_target_date`, `p_insert_ids`, `p_delete_ids`) match between the SQL (Task 1) and the `supabase.rpc` call (Task 5). `dict.planEditor` shape matches the `Labels` type consumed by `PlanEditor`.

**Placeholder scan:** none. Every step carries the code or command it needs; the editor's target date is a first-class prop + state and the save path is a single `onSave`.

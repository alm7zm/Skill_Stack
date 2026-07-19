# Plan editing — design

**Date:** 2026-07-19
**Status:** Approved (approach A)

## Problem

Today a study plan can only be born one way — the AI advisor generates it via
`POST /api/advisor/plan`, which inserts a `study_plans` row (with the plan as
`jsonb`) plus one `study_plan_topics` row per topic. After that the plan page
(`/plan/[planId]`) is **read-only**: the only mutation is ticking a topic
complete. Users cannot fix a wrong estimate, add a week, remove a topic, build a
plan themselves, or ask the advisor to change an existing plan.

Three requirements:

1. Edit a plan directly (no AI).
2. Create a plan without the advisor.
3. Ask the advisor to edit an existing plan.

## Key insight

All three are **one shared unit: a plan editor.** Direct editing, blank
creation, and accepting an advisor revision all end identically — a new set of
weeks/topics that is saved and reconciled against `study_plan_topics`, preserving
the completion state of every topic whose id survives. Build the editor once; the
three features are three doors into it.

## Approach

**A — client editor + one whole-plan Save action.** The editor is a client
component holding the draft in React state; one Save posts the entire plan to a
server action that rewrites `study_plans.plan` and reconciles the topic rows in a
single place. This matches the existing jsonb design (written whole, read whole),
keeps reconciliation in one testable function, and gives one clear mental model.
The editor is a genuinely interactive client island; the rest of the app stays
RSC-first. (Rejected: granular per-edit server actions — many round-trips and
partial-failure states; a no-JS form editor — add/remove/reorder + multi-select
resource picking is unusable without JS.)

## Decisions (from brainstorming)

- **Resources:** the editor includes a per-week resource picker — multi-select
  over the certification's existing catalog. No resource *creation*.
- **Advisor edit:** one-shot. Type an instruction → the advisor returns a revised
  plan → it replaces the editor's draft (that is the preview) → Save persists,
  discard reverts. Not a conversational refinement.
- **New plans start blank** (no skeleton). The user adds every week and topic.
- **Completion is preserved** for any topic whose id survives an edit; a removed
  topic's completion is discarded with its row.
- **Target date** becomes editable in the editor (`study_plans.target_date`,
  currently always null).

## Data model

No schema changes to tables — `study_plans.plan` (jsonb), `study_plans.target_date`,
and `study_plan_topics` already carry everything. Plan shape mirrors `StoredPlan`
/ `planSchema` (`{ summary?, recommended?, weeks: StudyWeek[] }`); a week is
`{ weekNumber, title, estimatedHours, hasPracticeExam, isReviewWeek, resourceIds[], topics[] }`;
a topic is `{ id, title, description, estimatedHours }`.

**One migration is required** (still no table or column changes). It adds two
things: (a) a DELETE policy on `study_plan_topics` — today it has
select/insert/update only (`supabase/schema.sql`), and reconciliation must delete
rows for removed topics; without the policy the delete is silently blocked by RLS
and orphaned completed rows would inflate the dashboard's `done` count (which
counts completed topic rows, not topics still present in the plan); and (b) the
`SECURITY INVOKER` `plpgsql` function that performs the transactional save (see
`savePlan`). The DELETE policy scopes through `study_plans.user_id = auth.uid()`,
matching the sibling policies.

## Units

- **`PlanEditor`** (client component). Props: initial `{ summary, targetDate, weeks }`,
  `certId`, the certification's catalog resources (for the picker), optional
  `planId` (absent = new plan), and labels. Renders:
  - summary textarea; target-date `<input type="date">`;
  - a list of weeks, each with: title, estimated hours, review-week and
    practice-exam toggles, a topic list (title + description + hours; add / remove
    / move up / move down), and a resource picker (multi-select of catalog
    resources, storing ids in `week.resourceIds`);
  - week-level add / remove / move up / move down;
  - a **"Revise with advisor"** instruction box;
  - Save and Cancel.

  New topics receive a generated stable id (`crypto.randomUUID`); editing an
  existing topic keeps its id. A topic produced by duplicating or copying another
  always gets a fresh UUID, never the original's — it is a new learning item and
  must not inherit the original's completion state. `weekNumber` is normalized to
  sequential 1..N on every render/save so reordering stays consistent.

  **Unsaved-changes protection.** The editor tracks whether the draft differs
  from the originally loaded plan. If it does, Cancel or navigating away opens a
  confirmation dialog offering "Continue editing" or "Discard changes"; if nothing
  has changed, Cancel navigates away immediately with no prompt.

- **`savePlan`** (server action). Validates the incoming draft (zod, trust
  boundary), filters each week's `resourceIds` against the certification's catalog
  (same guard as plan-gen), then:
  - `planId` present → update `study_plans.plan` + `target_date`; reconcile topics.
  - `planId` absent → insert a new `study_plans` row (with `user_id = auth.uid()`,
    set explicitly so the insert policy accepts it) + topic rows; redirect to the
    new `/plan/[id]`.

  Reconciliation, given the draft's topic ids `newIds` and the plan's existing
  `currentIds`:
  - insert rows for `newIds − currentIds` (completed=false);
  - delete rows for `currentIds − newIds`;
  - leave survivors (`newIds ∩ currentIds`) untouched → completion preserved.

  **Atomicity.** The entire save — insert/update the `study_plans` row, update
  `target_date`, and the topic insert/delete reconciliation — runs inside a single
  database transaction. Any failure rolls the whole operation back, so the `plan`
  jsonb can never end up inconsistent with `study_plan_topics` (e.g. a plan whose
  weeks reference topics that were never inserted, or completed rows for topics no
  longer in the plan). PostgREST auto-commits each call individually, so this is
  realized as one `plpgsql` function invoked via `supabase.rpc(...)`, added in the
  same migration as the DELETE policy. It is `SECURITY INVOKER`, so every statement
  inside still passes through the caller's RLS on both tables — the function is an
  atomicity boundary, not an authorization bypass.

  New plans **insert only on first Save**, never on "New" click, so an abandoned
  draft never leaves an empty plan in the dashboard — which removes any need for a
  delete-plan feature.

- **`POST /api/advisor/plan/edit`** (route). Body `{ certId, plan, instruction, locale }`.
  Runs `generateObject` with the existing `advisorModel`, `planSchema`, and
  `systemPrompt`, plus a revise-prompt that includes the current plan JSON and the
  instruction, and tells the model to **keep existing topic ids for unchanged or
  moved topics** and mint new ids only for genuinely new topics. The prompt is not
  trusted to do this alone: before the revised plan is returned, a server-side
  id-matching pass reconciles it against the original plan — each returned topic is
  matched to an original topic by normalized title (case- and whitespace-
  insensitive, falling back to description when titles are ambiguous), and a match
  reuses the original topic's id. Only topics with no match receive a fresh
  `crypto.randomUUID`. So completion state is protected even if the model rewrites
  identifiers. Returns the revised plan **unsaved**. Rate-limited via the existing
  `rateLimit(user.id, 'plan', …)` and answers provider failures with the shared
  `providerErrorResponse`.

- Thin RSC pages:
  - `plan/[planId]/edit/page.tsx` — loads the plan, its resources, and the
    certification catalog resources; renders `PlanEditor` with `planId`.
  - `plan/new/[certId]/page.tsx` — renders `PlanEditor` with no `planId` and an
    empty draft.
  - `plan/new/page.tsx` — a certification picker (RSC) for the dashboard entry;
    `new` is a static segment so it resolves ahead of `[planId]`.

## Data flow

Direct edit: `/plan/[planId]/edit` loads → user edits draft in `PlanEditor` →
Save → `savePlan` updates + reconciles → redirect to `/plan/[planId]`.

New plan: entry → `plan/new/[certId]` → blank `PlanEditor` → Save → `savePlan`
inserts row + topics → redirect to `/plan/[newId]`.

Advisor edit: in the editor, instruction → `/api/advisor/plan/edit` → revised
plan replaces the draft (preview) → user reviews/tweaks → Save (same path).
Discard reverts the draft to the loaded plan.

## Entry points

- Plan page (`/plan/[planId]`): an **Edit** button → `/plan/[planId]/edit`.
- Certification detail: **Build it yourself** as a secondary action beside "Ask
  the advisor" → `/plan/new/[certId]`.
- Dashboard: **New plan** → `/plan/new` (pick a certification) → editor.

## Validation

Server-side zod on Save (the body comes from a browser and is never trusted):
- weeks 1–104 (reuse `planSchema` bounds); `summary`/`recommended` optional for
  manual plans;
- the plan must contain **at least one topic** overall — not merely one week; a
  plan with no topics has nothing to track and is rejected;
- topic ids non-empty and unique across the plan (backstopped by the
  `unique(study_plan_id, topic_id)` constraint);
- `estimatedHours` must be non-negative on every week and topic; `title`
  non-empty;
- incoming `weekNumber` values are never trusted — they are always renumbered
  sequentially 1..N on the server before saving, whatever the client sent;
- any ownership fields in the body (e.g. `user_id`) are ignored; the row's owner
  is always `auth.uid()`, enforced by the insert policy;
- `resourceIds` filtered to the certification's catalog ids.

A week may have zero topics (it renders a hint), but the plan as a whole must have
at least one topic to Save.

## i18n

Editor, entry-point, and error strings added to `en.json` and `ar.json` with key
parity (checked by the existing parity script). Spacing uses logical properties
so Arabic RTL flips for free, consistent with the rest of the app.

## Testing

- `node --test` unit test for the reconciler: survivors keep completion, added
  topics insert, removed topics delete, duplicate ids rejected.
- `node --test` for the save-validation schema: bounds, empty/duplicate topic
  ids, week count limits.
- Manual/browser verification of the three flows (edit, create, advisor-edit) in
  both en and ar, including that completing a topic then editing the plan keeps
  it complete.

Existing gate before commit: `tsc --noEmit`, `npm test`, `eslint`, dict-parity,
`next build`.

## Non-goals (YAGNI)

- Drag-and-drop reordering — up/down buttons instead, no DnD dependency.
- Delete-plan — create-on-first-Save avoids abandoned empty plans, so nothing new
  needs deleting; the existing delete policy is untouched.
- Creating new catalog resources from the editor — the picker only selects
  existing ones.
- Conversational plan refinement — the advisor edit is one-shot.
- Optimistic-concurrency / multi-editor conflict handling — a user editing their
  own plan is single-writer; last-write-wins is acceptable.

## Risks

- **Reconciliation correctness** is the load-bearing piece (completion loss is the
  worst failure). Mitigated by isolating it in one function with a unit test, and
  by running the whole save in a single transaction so a partial failure cannot
  leave the plan jsonb and the topic table out of sync.
- **AI-edit id stability** — if the model re-mints ids for unchanged topics, their
  completion would reset. Mitigated in depth: the prompt asks the model to keep
  ids, a server-side title/description matching pass restores original ids before
  the draft is returned, and the user previews before saving.

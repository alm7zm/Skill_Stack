import type { EditableWeek, EditablePlan } from './types.ts';

/**
 * Renumber weeks 1..N in array order, and derive each week's hours from its
 * topics. Week hours are never entered by hand — a week is exactly the sum of
 * the work inside it, so this is the one place that total is computed.
 */
export function normalizeWeeks(weeks: EditableWeek[]): EditableWeek[] {
  return weeks.map((w, i) => ({
    ...w,
    weekNumber: i + 1,
    estimatedHours: weekHours(w.topics),
  }));
}

/** A week's hours: the sum of its topics' hours. */
export function weekHours(topics: { estimatedHours: number }[]): number {
  return topics.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
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

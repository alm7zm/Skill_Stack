import { cache } from 'react';
import { publicClient } from '@/lib/supabase/public';
import type { LearningResource } from '../types';

/**
 * Learning resources, read from public.certification_resources.
 *
 * This was a 31-entry array literal in this file. It moved to the database so an
 * n8n workflow can maintain it — a workflow cannot edit a TypeScript array that
 * gets compiled into the bundle, so "check these links still resolve" and
 * "propose a new course" were both impossible while this was code. Same move
 * certifications made, same reasons.
 * See supabase/migrations/20260718000001_resources_and_automation.sql.
 *
 * Reads go through publicClient (no cookies) for the same reason as the catalog.
 */

/** Explicit, so adding a column cannot silently bloat every query. */
const COLUMNS = 'id, certification_id, title, provider, url, duration, free, type, ai_reason';

type Row = {
  id: string;
  certification_id: string;
  title: string;
  provider: string;
  url: string;
  duration: string;
  free: boolean;
  type: LearningResource['type'];
  ai_reason: string | null;
};

function toResource(row: Row): LearningResource {
  return {
    id: row.id,
    certificationId: row.certification_id,
    title: row.title,
    provider: row.provider,
    url: row.url,
    duration: row.duration,
    free: row.free,
    type: row.type,
    aiReason: row.ai_reason ?? undefined,
  };
}

/**
 * Resources for one certification, excluding dead links.
 *
 * `dead` is set by the link-health workflow, never by a person. Filtering here
 * rather than deleting the row means a plan that already links to a resource
 * keeps its id resolvable in history, while nobody is sent to a 404 today.
 */
export const getResourcesForCertification = cache(
  async (certId: string): Promise<LearningResource[]> => {
    const { data, error } = await publicClient
      .from('certification_resources')
      .select(COLUMNS)
      .eq('certification_id', certId)
      .eq('dead', false)
      .order('free', { ascending: false }) // free first: it is the load-bearing fact
      .order('id');

    if (error) throw new Error(`Failed to load resources for ${certId}: ${error.message}`);
    return (data ?? []).map((r) => toResource(r as Row));
  }
);

/**
 * Resolve ids the advisor attached to a week. Unknown ids are dropped, not
 * guessed at — see the resourceIds note in lib/ai/advisor.ts.
 *
 * Dead links are NOT filtered here, deliberately: a plan that already recommends
 * a resource should keep showing it with its own note rather than have items
 * silently vanish from a week the user is working through. The catalog stops
 * offering it; an existing plan admits it.
 */
export const getResourcesByIds = cache(
  async (ids: readonly string[]): Promise<LearningResource[]> => {
    if (ids.length === 0) return [];

    const { data, error } = await publicClient
      .from('certification_resources')
      .select(COLUMNS)
      .in('id', [...ids]);

    if (error) throw new Error(`Failed to load resources: ${error.message}`);

    // Preserve the order the advisor chose — it ranked them best-first, and
    // `in` does not promise to give them back that way.
    const byId = new Map((data ?? []).map((r) => [r.id, toResource(r as Row)]));
    return ids.map((id) => byId.get(id)).filter((r): r is LearningResource => r !== undefined);
  }
);

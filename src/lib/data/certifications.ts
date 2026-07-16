import { cache } from 'react';
import { publicClient } from '@/lib/supabase/public';
import type { Certification, CertCategory, Difficulty } from '@/lib/types';

/**
 * The certification catalog, read from public.certifications.
 *
 * This was a 842-line array literal in this file. It moved to the database so a
 * wrong price can be fixed in the Supabase dashboard without a deploy, so the
 * catalog can outgrow what is sane to hold in a JS array, so each row can carry
 * its own verified date, and so users can report bad data against a real
 * foreign key. See supabase/migrations/20260717000001_certifications_table.sql.
 *
 * Reads go through publicClient (no cookies), so pages that call these can still
 * be prerendered. Freshness comes from each page's `export const revalidate`,
 * which is what lets a dashboard edit appear without a rebuild.
 */

/** Explicit, so adding a column cannot silently bloat every catalog query. */
const COLUMNS =
  'id, name, short_name, provider, category, description, difficulty, ' +
  'estimated_study_hours, exam_cost, exam_cost_currency, exam_duration, ' +
  'number_of_questions, passing_score, languages, remote_testing, prerequisites, ' +
  'career_opportunities, skills_gained, official_url, tags, trending, free, ' +
  'verified_at, verified_by';

interface Row {
  id: string;
  name: string;
  short_name: string;
  provider: string;
  category: string;
  description: string;
  difficulty: string;
  estimated_study_hours: number;
  exam_cost: string | number;
  exam_cost_currency: string;
  exam_duration: number;
  number_of_questions: number;
  passing_score: number;
  languages: string[] | null;
  remote_testing: boolean;
  prerequisites: string[] | null;
  career_opportunities: Certification['careerOpportunities'] | null;
  skills_gained: string[] | null;
  official_url: string;
  tags: string[] | null;
  trending: boolean;
  free: boolean;
  verified_at: string;
  verified_by: string | null;
}

function toCertification(row: Row): Certification {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    provider: row.provider,
    category: row.category as CertCategory,
    description: row.description,
    difficulty: row.difficulty as Difficulty,
    estimatedStudyHours: row.estimated_study_hours,
    // numeric(10,2) arrives as a string from PostgREST — JS numbers cannot hold
    // every numeric exactly, so the driver refuses to guess. Unary + here means
    // formatCurrency gets 150 rather than the string "150.00".
    examCost: Number(row.exam_cost),
    examCostCurrency: row.exam_cost_currency,
    examDuration: row.exam_duration,
    numberOfQuestions: row.number_of_questions,
    passingScore: row.passing_score,
    languages: row.languages ?? [],
    remoteTesting: row.remote_testing,
    prerequisites: row.prerequisites ?? [],
    careerOpportunities: row.career_opportunities ?? [],
    skillsGained: row.skills_gained ?? [],
    officialUrl: row.official_url,
    tags: row.tags ?? [],
    trending: row.trending,
    free: row.free,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by ?? undefined,
  };
}

/**
 * cache() dedupes per request, not across requests: a page that needs the
 * catalog twice (list + count) issues one query. Cross-request caching is the
 * page's `revalidate`, deliberately — that keeps the staleness window in one
 * obvious place rather than hidden in this module.
 */
export const getAllCertifications = cache(async (): Promise<Certification[]> => {
  const { data, error } = await publicClient
    .from('certifications')
    .select(COLUMNS)
    .order('name');

  // Throw rather than return []: an empty catalog and a broken database look
  // identical to every caller, and "no certifications exist" is a lie that
  // renders as a normal empty state nobody investigates.
  if (error) throw new Error(`Failed to load certifications: ${error.message}`);
  return (data as unknown as Row[]).map(toCertification);
});

export const getCertificationById = cache(
  async (id: string): Promise<Certification | undefined> => {
    const { data, error } = await publicClient
      .from('certifications')
      .select(COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to load certification ${id}: ${error.message}`);
    return data ? toCertification(data as unknown as Row) : undefined;
  }
);

export const getTrendingCertifications = cache(async (): Promise<Certification[]> => {
  const { data, error } = await publicClient
    .from('certifications')
    .select(COLUMNS)
    .eq('trending', true)
    .order('name');

  if (error) throw new Error(`Failed to load trending certifications: ${error.message}`);
  return (data as unknown as Row[]).map(toCertification);
});

/**
 * Filtering in Postgres rather than in JS — the point of the move. Every filter
 * is optional and they compose.
 *
 * `q` matches search_text, a trigger-maintained flattening of name, short name,
 * provider, category, skills and tags. The old JS search matched substrings
 * *inside* skills and tags, so filtering on the array columns directly would
 * quietly return fewer results than before.
 */
export async function searchCertifications({
  q = '',
  category = '',
  difficulty = '',
}: {
  q?: string;
  category?: string;
  difficulty?: string;
} = {}): Promise<Certification[]> {
  let query = publicClient.from('certifications').select(COLUMNS);

  const term = q.trim();
  // The pattern is passed to PostgREST verbatim (postgrest-js does no escaping),
  // so a % or _ typed into the search box would act as a SQL wildcard. Escaping
  // them costs nothing and leaves ordinary terms untouched.
  // ponytail: PostgREST also maps * onto %, which this does not handle — a
  // literal * still wildcards. No certification name contains one; fix it when
  // one does.
  if (term) query = query.ilike('search_text', `%${term.replace(/[%_]/g, '\\$&')}%`);
  if (category) query = query.eq('category', category);
  if (difficulty) query = query.eq('difficulty', difficulty);

  const { data, error } = await query.order('name');
  if (error) throw new Error(`Certification search failed: ${error.message}`);
  return (data as unknown as Row[]).map(toCertification);
}

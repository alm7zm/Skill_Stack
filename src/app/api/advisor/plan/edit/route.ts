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

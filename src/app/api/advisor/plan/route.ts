import { generateObject } from 'ai';
import { createClient, getUser } from '@/lib/supabase/server';
import { getAllCertifications, getCertificationById } from '@/lib/data/certifications';
import { getResourcesForCertification } from '@/lib/data/resources';
import { getProfile } from '@/lib/data/queries';
import { normalizeAdvisorSettings } from '@/lib/advisor-settings';
import {
  advisorModel,
  chatRequestSchema,
  knownFacts,
  planPrompt,
  planSchema,
  providerErrorResponse,
  resourcesForBudget,
  systemPrompt,
} from '@/lib/ai/advisor';

/**
 * Turns the advisor conversation into a structured plan and persists it.
 *
 * The generated body goes in study_plans.plan (jsonb, added by
 * 20260716000001_plan_storage_calendar_rls.sql). Before that migration the
 * schema had nowhere to put a plan at all — only a certification_id and a date —
 * which is part of why the old advisor could only pretend.
 *
 * Topic rows are seeded here so progress tracking has something to toggle, and
 * so the dashboard's counts have a denominator.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid request' }, { status: 400 });
  }

  const { certId, locale, messages } = parsed.data;
  const [cert, catalog, { profile, skills, languages }] = await Promise.all([
    getCertificationById(certId),
    getAllCertifications(),
    getProfile(),
  ]);
  if (!cert) {
    return Response.json({ error: 'unknown certification' }, { status: 404 });
  }

  // Budget filtering happens before the model sees the list, so "free only" is
  // a fact about what exists rather than an instruction it might skip.
  const offered = resourcesForBudget(
    await getResourcesForCertification(cert.id),
    profile?.budget
  );
  const settings = normalizeAdvisorSettings(profile?.advisor_settings);

  // Unlike streamText, generateObject rejects — so the failure arrives here and
  // gets the same treatment, otherwise a quota rejection would surface as an
  // unhandled 500 and the client would show "something broke".
  let plan;
  try {
    ({ object: plan } = await generateObject({
      model: advisorModel,
      schema: planSchema,
      system: systemPrompt(cert, locale, catalog, knownFacts(profile, skills, languages), settings),
      prompt: `${planPrompt(
        cert,
        locale,
        offered,
        { formats: profile?.preferred_resource_formats, sites: profile?.preferred_resource_sites },
        settings
      )}\n\nConversation so far:\n${messages.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
    }));
  } catch (err) {
    console.error('plan generation failed:', err);
    return providerErrorResponse(err);
  }

  // The model is told to use only ids from the list and is not trusted to. An id
  // it invented would render as a dead link or crash the lookup; dropping it
  // costs the week a suggestion, which is the honest outcome.
  const allowed = new Set(offered.map((r) => r.id));
  plan.weeks = plan.weeks.map((week) => ({
    ...week,
    resourceIds: [...new Set(week.resourceIds ?? [])].filter((id) => allowed.has(id)),
  }));

  const supabase = await createClient();

  // user_id is set explicitly because the insert policy checks
  // auth.uid() = user_id; RLS rejects any other value, so this cannot be forged.
  const { data: row, error: insertError } = await supabase
    .from('study_plans')
    .insert({
      user_id: user.id,
      certification_id: cert.id,
      plan,
      target_date: null,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    return Response.json(
      { error: 'could not save plan', detail: insertError?.message },
      { status: 500 }
    );
  }

  const topics = plan.weeks.flatMap((week) =>
    week.topics.map((topic) => ({
      study_plan_id: row.id,
      topic_id: topic.id,
      completed: false,
    }))
  );

  if (topics.length > 0) {
    // The model is told to emit unique ids but is not trusted to; the table has
    // a unique(study_plan_id, topic_id) constraint, so a duplicate would abort
    // the whole insert and leave a plan with no topics. Dedupe first.
    const seen = new Set<string>();
    const unique = topics.filter((t) => {
      if (seen.has(t.topic_id)) return false;
      seen.add(t.topic_id);
      return true;
    });

    const { error: topicError } = await supabase.from('study_plan_topics').insert(unique);
    if (topicError) {
      return Response.json(
        { error: 'could not save topics', detail: topicError.message },
        { status: 500 }
      );
    }
  }

  return Response.json({ planId: row.id, recommended: plan.recommended });
}

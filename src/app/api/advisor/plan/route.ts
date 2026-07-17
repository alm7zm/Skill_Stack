import { generateObject } from 'ai';
import { createClient, getUser } from '@/lib/supabase/server';
import { getAllCertifications, getCertificationById } from '@/lib/data/certifications';
import {
  advisorModel,
  chatRequestSchema,
  planPrompt,
  planSchema,
  providerErrorResponse,
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
  const [cert, catalog] = await Promise.all([
    getCertificationById(certId),
    getAllCertifications(),
  ]);
  if (!cert) {
    return Response.json({ error: 'unknown certification' }, { status: 404 });
  }

  // Unlike streamText, generateObject rejects — so the failure arrives here and
  // gets the same treatment, otherwise a quota rejection would surface as an
  // unhandled 500 and the client would show "something broke".
  let plan;
  try {
    ({ object: plan } = await generateObject({
      model: advisorModel,
      schema: planSchema,
      system: systemPrompt(cert, locale, catalog),
      prompt: `${planPrompt(cert, locale)}\n\nConversation so far:\n${messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n')}`,
    }));
  } catch (err) {
    console.error('plan generation failed:', err);
    return providerErrorResponse(err);
  }

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

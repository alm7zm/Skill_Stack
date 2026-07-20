import { z } from 'zod';
import { createClient, getUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CalendarAuthError, getAccessToken, upsertEvent } from '@/lib/calendar/google';
import {
  buildSlots,
  DEFAULT_SCHEDULE,
  eventTimes,
  normalizeStudySchedule,
  todayIn,
} from '@/lib/calendar/schedule';
import { getCertificationById } from '@/lib/data/certifications';
import { getPlanScheduleRaw } from '@/lib/data/queries';

/**
 * Pushes a plan's topics into the user's Google Calendar.
 *
 * The landing page advertised this feature and the repo had a CalendarEvent type
 * and Google credentials in .env.local — but no calendar code at all. This is it.
 *
 * Sessions land on the user's study schedule (Settings) — their time, on their
 * chosen weekdays, one topic per study-day. With no schedule set, DEFAULT_SCHEDULE
 * reproduces the old behaviour (every day, 18:00 UTC).
 *
 * Re-syncing updates the existing events rather than duplicating them, because
 * each topic remembers its calendar_event_id.
 */

const bodySchema = z.object({ planId: z.string().uuid() });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request' }, { status: 400 });

  const { planId } = parsed.data;

  // Read the plan through the *user* client, so RLS proves they own it before
  // the admin client is touched for anything.
  const supabase = await createClient();
  const [{ data: plan }, { data: profile }, planScheduleRaw] = await Promise.all([
    supabase.from('study_plans').select('id, certification_id, plan').eq('id', planId).maybeSingle(),
    supabase.from('profiles').select('study_schedule').eq('id', user.id).maybeSingle(),
    // Separate + tolerant: the study_plans.study_schedule column may not exist yet
    // (pre-migration). Folding it into the select above would fail the whole row.
    getPlanScheduleRaw(planId),
  ]);

  if (!plan) return Response.json({ error: 'not found' }, { status: 404 });

  // This plan's own schedule wins; else the profile's preferred; else the default.
  const schedule =
    normalizeStudySchedule(planScheduleRaw) ??
    normalizeStudySchedule(profile?.study_schedule) ??
    DEFAULT_SCHEDULE;

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 501 });
  }

  const { data: integration } = await admin
    .from('user_integrations')
    .select('refresh_token')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .maybeSingle();

  if (!integration) {
    return Response.json({ error: 'calendar not connected' }, { status: 428 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(integration.refresh_token);
  } catch (err) {
    if (err instanceof CalendarAuthError) {
      // The token was revoked. Drop it so the UI shows "connect" again rather
      // than failing forever with a token that will never work.
      await admin.from('user_integrations').delete().eq('user_id', user.id).eq('provider', 'google');
      return Response.json({ error: 'calendar needs reconnecting' }, { status: 428 });
    }
    throw err;
  }

  const { data: topicRows } = await supabase
    .from('study_plan_topics')
    .select('topic_id, calendar_event_id')
    .eq('study_plan_id', planId);

  const eventIdByTopic = new Map(
    (topicRows ?? []).map((r) => [r.topic_id, r.calendar_event_id as string | null])
  );

  const cert = await getCertificationById(plan.certification_id);
  const weeks = (plan.plan as { weeks?: { topics: { id: string; title: string; description: string; estimatedHours: number }[] }[] } | null)?.weeks ?? [];
  const topics = weeks.flatMap((w) => w.topics);

  // One slot per topic, on the user's schedule, starting after today in their zone.
  const slots = buildSlots(
    schedule,
    todayIn(schedule.timezone),
    topics.map((t) => t.estimatedHours)
  );

  let created = 0;
  let updated = 0;

  for (const [index, topic] of topics.entries()) {
    const existing = eventIdByTopic.get(topic.id) ?? null;

    const eventId = await upsertEvent(
      accessToken,
      {
        summary: `${cert?.shortName ?? 'Study'}: ${topic.title}`,
        description: topic.description,
        ...eventTimes(slots[index]),
      },
      existing
    );

    if (existing) updated += 1;
    else {
      created += 1;
      await supabase
        .from('study_plan_topics')
        .update({ calendar_event_id: eventId })
        .eq('study_plan_id', planId)
        .eq('topic_id', topic.id);
    }
  }

  return Response.json({ created, updated });
}

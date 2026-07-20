import { generateObject } from 'ai';
import { z } from 'zod';
import { getUser } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';
import { advisorModel, providerErrorResponse, MAX_INPUT_CHARS } from '@/lib/ai/advisor';
import { normalizeStudySchedule } from '@/lib/calendar/schedule';

/**
 * Turn a plain-language availability ("Wed evenings and Sunday afternoons") into
 * weekday study windows. The settings form fills its fields from the result; the
 * user reviews and saves. Not saved here — saveStudySchedule is the only writer.
 *
 * Timezone is the browser's, added on save — the model only reads days and times.
 */

const bodySchema = z.object({
  instruction: z.string().trim().min(1).max(MAX_INPUT_CHARS),
  locale: z.enum(['en', 'ar']),
});

// What the model returns. Kept loose (strings) — normalizeStudySchedule is the
// real gate, so a stray value is dropped rather than trusted.
const windowsSchema = z.object({
  windows: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6).describe('0=Sunday, 1=Monday, ... 6=Saturday'),
        start: z.string().describe('24-hour HH:MM, e.g. 20:00'),
        end: z.string().describe('24-hour HH:MM after start, e.g. 21:00'),
      })
    )
    .max(7),
});

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await rateLimit(user.id, 'schedule', 10);
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'invalid request' }, { status: 400 });

  let object;
  try {
    ({ object } = await generateObject({
      model: advisorModel,
      schema: windowsSchema,
      system: [
        'You turn a description of when someone is free into study windows, one per weekday.',
        'Weekdays are numbers: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday.',
        'Times are 24-hour HH:MM, and end must be after start (no overnight windows).',
        'At most one window per weekday. "Morning"≈09:00–12:00, "afternoon"≈13:00–17:00, "evening"≈18:00–21:00 unless the user gives exact times.',
        '"Weekends" means Saturday and Sunday; "weekdays" means Monday–Friday.',
        `The user is writing in ${parsed.data.locale === 'ar' ? 'Arabic' : 'English'}.`,
      ].join('\n'),
      prompt: parsed.data.instruction,
    }));
  } catch (err) {
    console.error('schedule parse failed:', err);
    return providerErrorResponse(err);
  }

  // The model sometimes drops the leading zero ("9:00"); pad it so the strict
  // HH:MM validator in normalizeStudySchedule doesn't discard the window.
  const pad = (t: string) => (/^\d:\d\d$/.test(t) ? `0${t}` : t);
  const windows = object.windows.map((w) => ({ ...w, start: pad(w.start), end: pad(w.end) }));

  // Validate through the same gate the store uses; UTC is a placeholder the form
  // replaces with the browser timezone on save.
  const schedule = normalizeStudySchedule({ windows, timezone: 'UTC' });
  if (!schedule) return Response.json({ error: 'unparsed' }, { status: 422 });

  return Response.json({ windows: schedule.windows });
}

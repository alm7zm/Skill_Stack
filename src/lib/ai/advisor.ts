import { google } from '@ai-sdk/google';
import { APICallError, RetryError } from 'ai';
import { z } from 'zod';
import type { Certification, LearningResource } from '@/lib/types';
import type { Locale } from '@/lib/i18n';
// Relative with extension, not '@/lib/...': this module is run directly by
// node --test, which resolves neither the @/ alias nor extensionless imports.
// (The @/ type-only imports above are fine — they erase before node sees them.)
import { siteOf } from '../resource-prefs.ts';

/** A learner's soft preferences over resources. Empty arrays mean "no preference". */
export type ResourcePreferences = { formats?: string[]; sites?: string[] };

/**
 * Shared between the chat route and the plan route.
 *
 * The old advisor was a hardcoded script: four canned questions, canned replies
 * chosen by array index, and a setTimeout to fake typing. It always concluded
 * the certification was "an excellent choice" regardless of what you answered.
 */

/** Mirrors StudyWeek/StudyTopic in lib/types.ts so the result drops straight in. */
export const planSchema = z.object({
  summary: z.string().describe('Two or three sentences on why this plan is shaped the way it is.'),
  recommended: z
    .boolean()
    .describe('False if this certification is a poor fit for the user. Be willing to say so.'),
  weeks: z
    .array(
      z.object({
        weekNumber: z.number().int().min(1),
        title: z.string(),
        estimatedHours: z.number().min(0),
        hasPracticeExam: z.boolean(),
        isReviewWeek: z.boolean(),
        /**
         * Ids picked from the candidate list in the prompt — never URLs.
         *
         * The model does the judgment (which resource suits week 3), the code
         * owns the facts (what that resource is and where it lives). Asking for
         * links directly would get invented ones: a plausible Udemy URL that
         * 404s, or worse, one that resolves to something else entirely. Ids are
         * checkable against the catalog, so a wrong one can be dropped; a wrong
         * URL is indistinguishable from a right one until someone clicks it.
         */
        resourceIds: z
          .array(z.string())
          .describe('Ids from the resource list, best first. Empty if none fit.'),
        topics: z.array(
          z.object({
            id: z.string().describe('Stable slug, e.g. "week1-iam-basics". Must be unique.'),
            title: z.string(),
            description: z.string(),
            estimatedHours: z.number().min(0),
          })
        ),
      })
    )
    .min(1),
});

export type GeneratedPlan = z.infer<typeof planSchema>;

const LANGUAGE: Record<Locale, string> = {
  en: 'English',
  ar: 'Modern Standard Arabic',
};

/**
 * What the profile already answers, so the advisor stops asking for it.
 *
 * Only fields the user filled in. An empty profile produces an empty list and
 * the advisor asks for everything, as before.
 */
export type KnownFacts = { label: string; value: string }[];

/**
 * Turns a profile row into the advisor's list of things it must not ask about.
 *
 * Labels are English regardless of locale: this is a system prompt, not user
 * copy. The model is told to reply in the user's language and does — feeding it
 * translated field names would only make the mapping fuzzier.
 */
export function knownFacts(
  profile: {
    career_goal?: string | null;
    job_role?: string | null;
    experience_level?: string | null;
    budget?: number | null;
    daily_study_time?: number | null;
    weekly_availability?: number | null;
    preferred_resource_formats?: string[] | null;
    preferred_resource_sites?: string[] | null;
  } | null,
  skills: string[] = [],
  languages: string[] = []
): KnownFacts {
  if (!profile && skills.length === 0 && languages.length === 0) return [];

  const facts: KnownFacts = [];
  const push = (label: string, value: string | number | null | undefined) => {
    // 0 is a real answer for budget and must survive: "I have no money for this"
    // is exactly the condition worth knowing. Only null/''/undefined are absent.
    if (value === null || value === undefined || value === '') return;
    facts.push({ label, value: String(value) });
  };

  push('Their career goal', profile?.career_goal);
  push('Their current role', profile?.job_role);
  push('Their self-reported experience level', profile?.experience_level);
  push('Hours they can study per day', profile?.daily_study_time);
  push('Days per week they are available', profile?.weekly_availability);
  if (profile?.budget !== null && profile?.budget !== undefined) {
    push(
      'Their budget for learning materials',
      profile.budget === 0 ? '0 — they can only use free resources' : `${profile.budget} USD`
    );
  }

  // Skills and languages were collected by the profile and read by nothing —
  // the user typed them in and no part of the app ever looked. They are the two
  // facts the advisor most obviously should not be re-asking for.
  push('Skills they already have', skills.length > 0 ? skills.join(', ') : undefined);
  push(
    'Languages they can sit an exam in',
    languages.length > 0 ? languages.join(', ') : undefined
  );

  const formats = profile?.preferred_resource_formats ?? [];
  const sites = profile?.preferred_resource_sites ?? [];
  push('Study formats they prefer', formats.length > 0 ? formats.join(', ') : undefined);
  push('Learning platforms they prefer', sites.length > 0 ? sites.join(', ') : undefined);

  return facts;
}

/**
 * `catalog` is passed in rather than imported: the catalog is a database read
 * now, and this module stays synchronous and testable by not doing I/O.
 */
export function systemPrompt(
  cert: Certification | undefined,
  locale: Locale,
  catalog: Certification[],
  known: KnownFacts = []
): string {
  return [
    'You are the SkillStack certification advisor.',
    `Reply only in ${LANGUAGE[locale]}. Keep certification names, provider names and technical terms in their original form.`,
    '',
    'Your job is to work out whether this certification actually suits this person, and then to pace a study plan around the time they really have.',
    '',
    'Rules:',
    '- Ask one question at a time. Keep questions short.',
    '- You need: why they want it, their experience level, hours per day available, a target date, and budget.',
    '- Be honest. If their experience or timeline makes this certification a bad fit, say so plainly and suggest a better starting point. Do not flatter.',
    '- Never invent exam costs, durations or pass rates. Use only the facts given below.',
    '- No emoji. No exclamation marks. Plain, specific language.',
    '',
    // The profile already holds most of what the advisor used to ask for, and
    // asking a person to retype what they typed into their profile is how an
    // app tells them it wasn't listening.
    known.length > 0
      ? [
          'This person already told SkillStack the following in their profile. Treat every line as already answered:',
          known.map((f) => `- ${f.label}: ${f.value}`).join('\n'),
          '',
          'Do not ask about anything on that list. Take it as given and reason from it.',
          'You may ask them to confirm a specific item only if their answers contradict it.',
          'Ask only for what is genuinely missing — typically why they want this particular certification, and their target date.',
          // The catalog knows which languages each exam is offered in, and the
          // profile knows which they read. Nothing was comparing the two.
          'If none of the languages they can sit an exam in appear in this exam\'s language list, say so plainly and early — it is a hard blocker, not a detail.',
          '',
        ].join('\n')
      : '',
    // Without this the model recommends from world knowledge and sends people to
    // certifications this app does not carry — it suggested AWS Cloud
    // Practitioner, which is a correct real-world answer and a dead end here.
    'You may only recommend a certification from this list. It is everything SkillStack carries.',
    'If the best real-world answer is not on the list, say that SkillStack does not cover it yet rather than naming it as a next step.',
    catalog.map((c) => `- ${c.name} (${c.shortName}) — ${c.difficulty}`).join('\n'),
    '',
    cert
      ? [
          'The certification under discussion:',
          `- Name: ${cert.name} (${cert.shortName}) by ${cert.provider}`,
          `- Level: ${cert.difficulty}`,
          `- Typical study time: ${cert.estimatedStudyHours} hours`,
          `- Exam cost: ${cert.examCost} ${cert.examCostCurrency}`,
          `- Exam: ${cert.examDuration} minutes, ${cert.numberOfQuestions} questions, pass mark ${cert.passingScore}%`,
          `- Prerequisites: ${cert.prerequisites.length ? cert.prerequisites.join(', ') : 'none'}`,
          `- Skills covered: ${cert.skillsGained.join(', ')}`,
          // The catalog has always stored this and the prompt never passed it,
          // so the model could not have answered "can I sit this in Arabic?"
          // even though the row next to it says.
          `- Offered in: ${cert.languages.length ? cert.languages.join(', ') : 'unknown'}`,
        ].join('\n')
      : 'No specific certification has been chosen yet. Help them pick one.',
  ].join('\n');
}

/**
 * The resources the model is allowed to attach to a week.
 *
 * Budget is enforced here rather than asked for in the prompt: a rule in prose
 * is a request, and a model that ignores it sends someone with no money to a
 * $90 course. A model cannot pick what it was never shown.
 *
 * Anything other than an explicit 0 gets the full list — an unset budget means
 * "we don't know", not "free only", and paid resources stay labelled in the UI
 * so the choice is still the user's.
 */
export function resourcesForBudget(
  resources: LearningResource[],
  budget: number | null | undefined
): LearningResource[] {
  return budget === 0 ? resources.filter((r) => r.free) : resources;
}

export function planPrompt(
  cert: Certification | undefined,
  locale: Locale,
  resources: LearningResource[] = [],
  preferences: ResourcePreferences = {}
): string {
  const formats = preferences.formats ?? [];
  const sites = preferences.sites ?? [];
  // A preference is a tie-breaker, never a filter: excluding good resources a
  // learner didn't pre-approve is how you hand someone a week with nothing in
  // it. So this steers ordering, and the "do not exclude" line is load-bearing.
  const preferenceLines =
    formats.length > 0 || sites.length > 0
      ? [
          '',
          'This learner has stated preferences. Treat them as tie-breakers, not filters:',
          formats.length > 0 ? `- Preferred formats: ${formats.join(', ')}.` : '',
          sites.length > 0 ? `- Preferred platforms: ${sites.join(', ')}.` : '',
          '- When two resources fit a week equally well, put the preferred one first.',
          '- Never drop a genuinely good resource just because it is not preferred, and never leave a week empty for the sake of a preference.',
        ].filter(Boolean)
      : [];

  return [
    `Produce a study plan in ${LANGUAGE[locale]} based on the conversation.`,
    'Pace it to the hours per day the user actually stated, not to an ideal schedule.',
    'Total the weekly hours to roughly the certification\'s typical study time.',
    'Include at least one review week and at least one practice exam before the target date.',
    'Set recommended=false if the conversation showed this is a poor fit.',
    cert ? `Certification: ${cert.name} — typical study time ${cert.estimatedStudyHours} hours.` : '',
    '',
    resources.length > 0
      ? [
          'Attach resources to each week by putting their ids in that week\'s resourceIds.',
          'Rules for resourceIds:',
          '- Use only ids from the list below. Never write a URL, a title, or an id that is not listed.',
          '- One to three per week, ordered best first. Prefer the ones that match what that week covers.',
          '- Match the type to the week: documentation and courses while learning, practice-exam ids only in a practice or review week.',
          '- Reusing an id across weeks is fine when the resource genuinely spans them.',
          '- If nothing on the list fits a week, leave resourceIds empty rather than forcing one in.',
          ...preferenceLines,
          '',
          // Site is shown so the model can honour a platform preference; it is
          // derived from the url, not a stored field.
          'Available resources (id | title | provider | site | type | price | length):',
          resources
            .map(
              (r) =>
                `- ${r.id} | ${r.title} | ${r.provider} | ${siteOf(r.url) ?? 'other'} | ${
                  r.type
                } | ${r.free ? 'free' : 'paid'} | ${r.duration}`
            )
            .join('\n'),
        ].join('\n')
      : // Only 12 of the 28 certifications have a curated resource list. Saying
        // so beats leaving the model to guess why the list is empty and fill it.
        'There are no curated resources for this certification. Leave every resourceIds empty.',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ---------------------------------------------------------------------------
 * Request validation — this is a trust boundary. The body arrives from a
 * browser and drives a paid API call, so it is checked rather than trusted.
 * ------------------------------------------------------------------------ */

const MAX_MESSAGES = 40;
const MAX_CHARS = 4000;

export const chatRequestSchema = z.object({
  certId: z.string().min(1).max(100),
  locale: z.enum(['en', 'ar']),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MAX_CHARS),
      })
    )
    .min(1)
    .max(MAX_MESSAGES),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * One model instance for both the chat and plan routes, so they cannot drift.
 *
 * Gemini rather than OpenAI because Google AI Studio has a real free tier and
 * this project had no usable OpenAI key. Reads GOOGLE_GENERATIVE_AI_API_KEY —
 * an AI Studio key, which is NOT the GOOGLE_CLIENT_ID/SECRET pair used for
 * Calendar OAuth.
 *
 * Pinned to an exact model, not an alias like `gemini-flash-latest`: an alias
 * re-points underneath you, so the advisor's tone and the plan JSON would change
 * without a deploy, and this prompt is tuned to be blunt rather than flattering.
 * A pin fails loudly at a known time; an alias drifts quietly.
 *
 * Overridable by env because this value demonstrably does not hold still — in a
 * single session gemini-2.5-flash started 404ing ("no longer available to new
 * users") and gemini-2.0-flash had its free tier cut to limit: 0. When the next
 * one goes, that should be an env change, not a deploy.
 *
 * Default is flash-lite for the free tier's sake: gemini-3.5-flash allows 20
 * requests per DAY there (measured from its own 429), and one advisor
 * conversation costs five or six. Both were checked against the real prompt and
 * both refuse a beginner and stay inside the catalog; 3.5-flash reasons a little
 * more richly, so set GEMINI_MODEL=gemini-3.5-flash if you are paying for quota.
 *
 * To find a live replacement:
 *   GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY
 * — but listing is not proof: 2.5-flash still appears there while refusing every
 * call. Probe a candidate with :generateContent before trusting it.
 *
 * Swapping providers is one line: `openai('gpt-5-mini')` with @ai-sdk/openai
 * installed. Everything downstream is provider-agnostic AI SDK code.
 */
export const advisorModel = google(process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite');

/* ---------------------------------------------------------------------------
 * Provider failures
 * ------------------------------------------------------------------------ */

/** Free-tier quota, mid-stream provider failure, or something unclassified. */
export type AdvisorFailure = { error: 'quota'; retryAfter?: number } | { error: 'provider' };

/**
 * Turns whatever the AI SDK threw into something the client can act on.
 *
 * The SDK wraps the real failure: after exhausting its retries it reports a
 * RetryError, and the useful object — status code, response body — is its
 * lastError. Reading `.message` instead would give prose that changes.
 */
export function describeProviderFailure(err: unknown): AdvisorFailure {
  const api = RetryError.isInstance(err) ? err.lastError : err;
  if (!APICallError.isInstance(api)) return { error: 'provider' };

  if (api.statusCode === 429) {
    // Google returns how long to wait, in a RetryInfo detail. It is the
    // difference between "try again in a minute" and "try again, who knows".
    const match = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(String(api.responseBody ?? ''));
    const retryAfter = match ? Math.ceil(Number(match[1])) : undefined;
    return { error: 'quota', retryAfter };
  }

  return { error: 'provider' };
}

/** Same failure as an HTTP response, so both routes answer identically. */
export function providerErrorResponse(err: unknown): Response {
  const failure = describeProviderFailure(err);
  if (failure.error === 'quota') {
    return Response.json(failure, {
      status: 429,
      // Standard header as well as the body: proxies and fetch wrappers know it.
      headers: failure.retryAfter ? { 'retry-after': String(failure.retryAfter) } : {},
    });
  }
  return Response.json(failure, { status: 502 });
}

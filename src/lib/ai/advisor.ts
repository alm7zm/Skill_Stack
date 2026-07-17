import { google } from '@ai-sdk/google';
import { APICallError, RetryError } from 'ai';
import { z } from 'zod';
import type { Certification } from '@/lib/types';
import type { Locale } from '@/lib/i18n';

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
 * `catalog` is passed in rather than imported: the catalog is a database read
 * now, and this module stays synchronous and testable by not doing I/O.
 */
export function systemPrompt(
  cert: Certification | undefined,
  locale: Locale,
  catalog: Certification[]
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
        ].join('\n')
      : 'No specific certification has been chosen yet. Help them pick one.',
  ].join('\n');
}

export function planPrompt(cert: Certification | undefined, locale: Locale): string {
  return [
    `Produce a study plan in ${LANGUAGE[locale]} based on the conversation.`,
    'Pace it to the hours per day the user actually stated, not to an ideal schedule.',
    'Total the weekly hours to roughly the certification\'s typical study time.',
    'Include at least one review week and at least one practice exam before the target date.',
    'Set recommended=false if the conversation showed this is a poor fit.',
    cert ? `Certification: ${cert.name} — typical study time ${cert.estimatedStudyHours} hours.` : '',
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

import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { certifications } from '@/lib/data/certifications';
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

export function systemPrompt(cert: Certification | undefined, locale: Locale): string {
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
    certifications.map((c) => `- ${c.name} (${c.shortName}) — ${c.difficulty}`).join('\n'),
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
 * Pinned deliberately. `gemini-flash-latest` also works and never 404s, but it
 * re-points underneath you: the advisor's tone and the plan JSON it produces
 * would change without a deploy, and this prompt is tuned to be blunt rather
 * than flattering. A pin fails loudly at a known time; an alias drifts quietly.
 *
 * When this is retired Google returns 404 "no longer available to new users"
 * (which is what killed gemini-2.5-flash here). To find a live replacement:
 *   GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY
 * — but note that listing is not proof: 2.5-flash still appears in it while
 * refusing every call. Probe the candidate with :generateContent before trusting it.
 *
 * Swapping providers is one line: `openai('gpt-5-mini')` with @ai-sdk/openai
 * installed. Everything downstream is provider-agnostic AI SDK code.
 */
export const advisorModel = google('gemini-3.5-flash');

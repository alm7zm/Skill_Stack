import { z } from 'zod';

const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  estimatedHours: z.number().min(0),
});

const weekSchema = z.object({
  weekNumber: z.number().int().min(1),
  title: z.string().min(1),
  estimatedHours: z.number().min(0),
  hasPracticeExam: z.boolean(),
  isReviewWeek: z.boolean(),
  resourceIds: z.array(z.string()),
  topics: z.array(topicSchema),
});

/** The plan jsonb shape (also what the advisor-edit body carries). */
export const storedPlanSchema = z.object({
  summary: z.string().optional(),
  recommended: z.boolean().optional(),
  weeks: z.array(weekSchema).min(1).max(104),
});

const atLeastOneTopic = (p: { weeks: { topics: unknown[] }[] }) =>
  p.weeks.some((w) => w.topics.length > 0);

const uniqueTopicIds = (p: { weeks: { topics: { id: string }[] }[] }) => {
  const ids = p.weeks.flatMap((w) => w.topics.map((t) => t.id));
  return new Set(ids).size === ids.length;
};

/** Input to the savePlan action — a trust boundary; the body comes from a browser. */
export const savePlanSchema = storedPlanSchema
  .extend({
    planId: z.string().uuid().optional(),
    certId: z.string().min(1).max(100),
    // '' from an empty <input type="date">, or a real date. Never a partial.
    targetDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  })
  .refine(atLeastOneTopic, { message: 'A plan needs at least one topic.' })
  .refine(uniqueTopicIds, { message: 'Topic ids must be unique.' });

export const editRequestSchema = z.object({
  certId: z.string().min(1).max(100),
  locale: z.enum(['en', 'ar']),
  instruction: z.string().min(1).max(2000),
  plan: storedPlanSchema,
});

export type StoredPlanInput = z.infer<typeof storedPlanSchema>;
export type SavePlanInput = z.infer<typeof savePlanSchema> & { lang: string };

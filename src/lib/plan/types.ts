// The stored-jsonb shape of a plan, matching what the advisor's planSchema emits
// and what study_plans.plan already holds. Kept separate from the richer runtime
// StudyWeek/StudyTopic in lib/types.ts, which carry completion and resolved
// resources that the jsonb deliberately does not.
export type EditableTopic = {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
};

export type EditableWeek = {
  weekNumber: number;
  title: string;
  estimatedHours: number;
  hasPracticeExam: boolean;
  isReviewWeek: boolean;
  resourceIds: string[];
  topics: EditableTopic[];
};

export type EditablePlan = {
  summary?: string;
  recommended?: boolean;
  weeks: EditableWeek[];
};

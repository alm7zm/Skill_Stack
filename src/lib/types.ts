// SkillStack - Core TypeScript Types

export type CertCategory =
  | 'cloud'
  | 'ai'
  | 'cybersecurity'
  | 'networking'
  | 'programming'
  | 'data'
  | 'project-management'
  | 'devops';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/** Row of public.certifications, camelCased. See lib/data/certifications.ts. */
export interface Certification {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  category: CertCategory;
  description: string;
  difficulty: Difficulty;
  estimatedStudyHours: number;
  examCost: number;
  examCostCurrency: string;
  examDuration: number; // minutes
  numberOfQuestions: number;
  passingScore: number; // percentage
  languages: string[];
  remoteTesting: boolean;
  prerequisites: string[];
  careerOpportunities: CareerOpportunity[];
  skillsGained: string[];
  officialUrl: string;
  tags: string[];
  trending: boolean;
  free: boolean;
  /** When a person last checked this row against officialUrl. Per-cert: one
   *  global constant meant re-checking one price implied re-checking all 28. */
  verifiedAt: string;
  verifiedBy?: string;
}

/** What a user can tell us is wrong. Mirrors the certification_reports check. */
export type ReportField =
  | 'exam_cost'
  | 'study_hours'
  | 'exam_details'
  | 'prerequisites'
  | 'url'
  | 'other';

export interface CareerOpportunity {
  title: string;
  salaryMin: number;
  salaryMax: number;
  currency: string;
}

export interface LearningResource {
  id: string;
  certificationId: string;
  title: string;
  provider: string;
  url: string;
  duration: string;
  free: boolean;
  type: 'course' | 'documentation' | 'video' | 'practice-exam' | 'book';
  aiReason?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  careerGoal: string;
  currentRole: string;
  experienceLevel: Difficulty;
  skills: string[];
  languages: string[];
  budget: number;
  dailyStudyTime: number; // hours
  weeklyAvailability: number; // days
  createdAt: string;
}

export interface StudyPlan {
  id: string;
  userId: string;
  certificationId: string;
  certification?: Certification;
  status: 'active' | 'completed' | 'paused';
  weeks: StudyWeek[];
  startDate: string;
  targetDate: string;
  createdAt: string;
}

export interface StudyWeek {
  weekNumber: number;
  title: string;
  topics: StudyTopic[];
  estimatedHours: number;
  hasPracticeExam: boolean;
  isReviewWeek: boolean;
  /** Ids into learningResources, chosen by the advisor and validated server-side.
   *  Optional: plans generated before resources existed have no field here. */
  resourceIds?: string[];
}

export interface StudyTopic {
  id: string;
  title: string;
  description: string;
  estimatedHours: number;
  completed: boolean;
  resources: LearningResource[];
}

export interface Progress {
  userId: string;
  planId: string;
  completedTopics: string[];
  percentage: number;
  streak: number;
  lastActivity: string;
  estimatedCompletion: string;
}

export interface AdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestions?: string[];
}

export interface AdvisorStage {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  active: boolean;
}

export interface DashboardStats {
  activePlans: number;
  studyHoursThisWeek: number;
  currentStreak: number;
  examReadiness: number;
}

export interface CalendarEvent {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  type: 'study' | 'milestone' | 'revision' | 'practice-exam';
}

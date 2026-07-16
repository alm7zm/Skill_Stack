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

export interface Certification {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  providerLogo: string;
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
  trending?: boolean;
  free?: boolean;
  color: string; // Brand accent color
}

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

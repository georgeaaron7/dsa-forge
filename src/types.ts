// ─── Core Data Types ─────────────────────────────────────────────

export interface Problem {
  id: string;
  topicId: string;
  topic: string;
  title: string;
  link: string;
  solution: string;
  summary: string;
  approach: string;
  pseudoCode: string;
  complexity: string;
  notes: string;
}

export interface Topic {
  id: string;
  name: string;
  displayOrder: number;
  problemCount: number;
}

export type RecallRating = 'blank' | 'vague' | 'can_explain' | 'can_code';

export interface Review {
  id: string;
  problemId: string;
  topicId: string;
  rating: RecallRating;
  timestamp: number;
  xpEarned: number;
  wasOverdue: boolean;
  gapDays: number;
}

export type MasteryLevel = 'new' | 'learning' | 'familiar' | 'strong' | 'interview_ready';

export interface MasteryRecord {
  problemId: string;
  topicId: string;
  level: MasteryLevel;
  reviewCount: number;
  lastReviewedAt: number | null;
  nextDueDate: number | null;
  consecutiveCorrect: number;
  ease: number;
  stability: number;
  isWeak: boolean;
  isBookmarked: boolean;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  mode: StudyMode;
  topicId: string | null;
  problemsReviewed: number;
  xpEarned: number;
}

export interface UserStats {
  totalXP: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  totalReviews: number;
  badges: Badge[];
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: number;
}

export type StudyMode =
  | 'continue'
  | 'due_today'
  | 'topic_run'
  | 'weak_problems'
  | 'boss_round'
  | 'placement';

export type ViewName =
  | 'dashboard'
  | 'review'
  | 'topics'
  | 'weak'
  | 'boss'
  | 'placement'
  | 'analytics'
  | 'settings';

// ─── Resume State (localStorage) ────────────────────────────────

export interface ResumeState {
  currentView: ViewName;
  currentTopicId: string | null;
  currentProblemId: string | null;
  currentMode: StudyMode | null;
  reviewQueueCursor: number;
  themePreference: 'dark' | 'light';
  lastOpenedAt: number;
  activeFilters: string[];
}

// ─── Backup ──────────────────────────────────────────────────────

export interface BackupData {
  version: string;
  exportedAt: number;
  stats: UserStats;
  mastery: MasteryRecord[];
  reviews: Review[];
  sessions: SessionRecord[];
}

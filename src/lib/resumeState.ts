import type { ResumeState, ViewName, StudyMode } from '../types';

const RESUME_KEY = 'dsa-platform-resume';

const defaultResume: ResumeState = {
  currentView: 'dashboard',
  currentTopicId: null,
  currentProblemId: null,
  currentMode: null,
  reviewQueueCursor: 0,
  themePreference: 'dark',
  lastOpenedAt: Date.now(),
  activeFilters: [],
};

export function getResumeState(): ResumeState {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return { ...defaultResume, lastOpenedAt: Date.now() };
    return { ...defaultResume, ...JSON.parse(raw), lastOpenedAt: Date.now() };
  } catch {
    return { ...defaultResume, lastOpenedAt: Date.now() };
  }
}

export function saveResumeState(partial: Partial<ResumeState>): void {
  try {
    const current = getResumeState();
    const updated = { ...current, ...partial, lastOpenedAt: Date.now() };
    localStorage.setItem(RESUME_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be blocked
  }
}

export function setCurrentView(view: ViewName): void {
  saveResumeState({ currentView: view });
}

export function setCurrentProblem(problemId: string | null, topicId: string | null): void {
  saveResumeState({ currentProblemId: problemId, currentTopicId: topicId });
}

export function setCurrentMode(mode: StudyMode | null): void {
  saveResumeState({ currentMode: mode });
}

export function setReviewCursor(cursor: number): void {
  saveResumeState({ reviewQueueCursor: cursor });
}

export function setTheme(theme: 'dark' | 'light'): void {
  saveResumeState({ themePreference: theme });
  document.documentElement.setAttribute('data-theme', theme);
}

export function clearResumeState(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    // noop
  }
}

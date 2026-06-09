import type { RecallRating, MasteryLevel, MasteryRecord } from '../types';

// ─── Interval Mapping (in days) ─────────────────────────────────

const BASE_INTERVALS: Record<RecallRating, number> = {
  blank: 1,
  vague: 2,
  can_explain: 7,
  can_code: 14,
};

// ─── XP Rewards ──────────────────────────────────────────────────

export function calculateXP(
  rating: RecallRating,
  isFirstReview: boolean,
  isOverdue: boolean,
  gapDays: number
): number {
  let xp = 0;

  // Base XP by rating
  switch (rating) {
    case 'blank':
      xp = 5;
      break;
    case 'vague':
      xp = 15;
      break;
    case 'can_explain':
      xp = 30;
      break;
    case 'can_code':
      xp = 50;
      break;
  }

  // First review gets reduced XP (review is more valuable)
  if (isFirstReview) {
    xp = Math.round(xp * 0.6);
  }

  // Successful delayed recall bonus
  if (!isFirstReview && gapDays > 3 && (rating === 'can_explain' || rating === 'can_code')) {
    xp = Math.round(xp * 1.5);
  }

  // Overdue bonus for good performance
  if (isOverdue && (rating === 'can_explain' || rating === 'can_code')) {
    xp = Math.round(xp * 1.3);
  }

  // Penalty for blanking after long gap
  if (rating === 'blank' && gapDays > 7) {
    xp = Math.max(2, Math.round(xp * 0.5));
  }

  return xp;
}

// ─── Next Due Date ───────────────────────────────────────────────

export function calculateNextDueDate(
  rating: RecallRating,
  currentEase: number,
  consecutiveCorrect: number
): number {
  const baseInterval = BASE_INTERVALS[rating];

  // Multiplier grows with consecutive correct answers
  let multiplier = 1;
  if (rating === 'can_explain' || rating === 'can_code') {
    multiplier = 1 + consecutiveCorrect * 0.3;
  }

  // Ease factor adjustment
  const easeFactor = Math.max(0.5, currentEase);

  const intervalDays = Math.round(baseInterval * multiplier * easeFactor);
  const cappedDays = Math.min(intervalDays, 90); // Cap at 90 days

  return Date.now() + cappedDays * 24 * 60 * 60 * 1000;
}

// ─── Ease Factor Update ──────────────────────────────────────────

export function updateEase(currentEase: number, rating: RecallRating): number {
  switch (rating) {
    case 'blank':
      return Math.max(0.5, currentEase - 0.3);
    case 'vague':
      return Math.max(0.5, currentEase - 0.1);
    case 'can_explain':
      return Math.min(3.0, currentEase + 0.1);
    case 'can_code':
      return Math.min(3.0, currentEase + 0.2);
  }
}

// ─── Mastery Level ───────────────────────────────────────────────

export function calculateMasteryLevel(mastery: MasteryRecord): MasteryLevel {
  const { reviewCount, consecutiveCorrect, ease } = mastery;

  if (reviewCount === 0) return 'new';
  if (consecutiveCorrect >= 5 && ease >= 2.0) return 'interview_ready';
  if (consecutiveCorrect >= 3 && ease >= 1.5) return 'strong';
  if (consecutiveCorrect >= 1 && reviewCount >= 2) return 'familiar';
  return 'learning';
}

// ─── Update Mastery After Review ─────────────────────────────────

export function updateMasteryAfterReview(
  current: MasteryRecord,
  rating: RecallRating
): MasteryRecord {
  const now = Date.now();
  const lastReviewed = current.lastReviewedAt;
  const gapDays = lastReviewed ? Math.floor((now - lastReviewed) / (24 * 60 * 60 * 1000)) : 0;
  const isFirstReview = current.reviewCount === 0;
  const isOverdue =
    current.nextDueDate !== null && now > current.nextDueDate;

  const newConsecutive =
    rating === 'can_explain' || rating === 'can_code'
      ? current.consecutiveCorrect + 1
      : 0;

  const newEase = updateEase(current.ease, rating);

  const isWeak =
    rating === 'blank' ||
    (rating === 'vague' && current.consecutiveCorrect === 0);

  const xp = calculateXP(rating, isFirstReview, isOverdue, gapDays);

  const updated: MasteryRecord = {
    ...current,
    reviewCount: current.reviewCount + 1,
    lastReviewedAt: now,
    nextDueDate: calculateNextDueDate(rating, newEase, newConsecutive),
    consecutiveCorrect: newConsecutive,
    ease: newEase,
    level: 'new', // placeholder, will be recalculated
    isWeak,
    stability: rating === 'blank' ? Math.max(0, current.stability - 1) : current.stability + 1,
  };

  updated.level = calculateMasteryLevel(updated);

  return { ...updated, _xpEarned: xp, _gapDays: gapDays, _wasOverdue: isOverdue, _isFirstReview: isFirstReview } as MasteryRecord & { _xpEarned: number; _gapDays: number; _wasOverdue: boolean; _isFirstReview: boolean };
}

// ─── Mastery Decay ───────────────────────────────────────────────

export function checkMasteryDecay(mastery: MasteryRecord): MasteryRecord {
  if (!mastery.nextDueDate || !mastery.lastReviewedAt) return mastery;

  const now = Date.now();
  const overdueDays = Math.floor((now - mastery.nextDueDate) / (24 * 60 * 60 * 1000));

  if (overdueDays > 14) {
    // Significant decay after 2 weeks overdue
    const decayedEase = Math.max(0.5, mastery.ease - 0.2);
    const updated = {
      ...mastery,
      ease: decayedEase,
      isWeak: true,
    };
    updated.level = calculateMasteryLevel(updated);
    return updated;
  }

  return mastery;
}

// ─── Level from XP ───────────────────────────────────────────────

export function levelFromXP(totalXP: number): number {
  // Each level requires progressively more XP
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 300 XP, etc.
  let level = 1;
  let threshold = 100;
  let xpRemaining = totalXP;

  while (xpRemaining >= threshold) {
    xpRemaining -= threshold;
    level++;
    threshold = Math.round(threshold * 1.4);
  }

  return level;
}

export function xpForCurrentLevel(totalXP: number): { current: number; required: number } {
  let threshold = 100;
  let xpRemaining = totalXP;

  while (xpRemaining >= threshold) {
    xpRemaining -= threshold;
    threshold = Math.round(threshold * 1.4);
  }

  return { current: xpRemaining, required: threshold };
}

// ─── Streak ──────────────────────────────────────────────────────

export function updateStreak(lastActiveDate: string, currentStreak: number): { streak: number; isNewDay: boolean } {
  const today = new Date().toISOString().split('T')[0];

  if (lastActiveDate === today) {
    return { streak: currentStreak, isNewDay: false };
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (lastActiveDate === yesterday) {
    return { streak: currentStreak + 1, isNewDay: true };
  }

  // Streak broken
  return { streak: 1, isNewDay: true };
}

// ─── Interview Readiness Score ───────────────────────────────────

export function calculateInterviewReadiness(masteryRecords: MasteryRecord[]): number {
  if (masteryRecords.length === 0) return 0;

  const weights: Record<MasteryLevel, number> = {
    new: 0,
    learning: 15,
    familiar: 40,
    strong: 70,
    interview_ready: 100,
  };

  const totalScore = masteryRecords.reduce((sum, m) => sum + weights[m.level], 0);
  return Math.round(totalScore / masteryRecords.length);
}

// ─── Topic Mastery ───────────────────────────────────────────────

export function calculateTopicMastery(masteryRecords: MasteryRecord[]): number {
  if (masteryRecords.length === 0) return 0;
  const weights: Record<MasteryLevel, number> = {
    new: 0,
    learning: 20,
    familiar: 50,
    strong: 80,
    interview_ready: 100,
  };
  const total = masteryRecords.reduce((sum, m) => sum + weights[m.level], 0);
  return Math.round(total / masteryRecords.length);
}

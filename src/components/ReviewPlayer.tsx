import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Code,
  Bookmark,
  BookmarkCheck,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import type { Problem, MasteryRecord, RecallRating, StudyMode, ViewName } from '../types';
import { getProblem, getMastery, putMastery, putReview, getStats, putStats, getDueProblems, getWeakProblems, getProblemsByTopic, getAllProblems } from '../lib/db';
import { updateMasteryAfterReview, updateStreak, levelFromXP } from '../lib/spacedRepetition';
import { setCurrentProblem, setReviewCursor } from '../lib/resumeState';

interface ReviewPlayerProps {
  mode: StudyMode;
  topicId: string | null;
  initialProblemId: string | null;
  initialCursor: number;
  onNavigate: (view: ViewName) => void;
  onXPGain: (xp: number) => void;
  onStatsUpdate: () => void;
}

export default function ReviewPlayer({
  mode,
  topicId,
  initialProblemId,
  initialCursor,
  onNavigate,
  onXPGain,
  onStatsUpdate,
}: ReviewPlayerProps) {
  const [queue, setQueue] = useState<string[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [mastery, setMastery] = useState<MasteryRecord | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showApproach, setShowApproach] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [rated, setRated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Build review queue
  const buildQueue = useCallback(async () => {
    let problemIds: string[] = [];

    switch (mode) {
      case 'due_today': {
        const due = await getDueProblems();
        problemIds = due.map((m) => m.problemId);
        break;
      }
      case 'weak_problems': {
        const weak = await getWeakProblems();
        problemIds = weak.map((m) => m.problemId);
        break;
      }
      case 'topic_run': {
        if (topicId) {
          const problems = await getProblemsByTopic(topicId);
          problemIds = problems.map((p) => p.id);
        }
        break;
      }
      case 'boss_round': {
        // Mixed topic challenge - grab random from all topics
        const all = await getAllProblems();
        const shuffled = [...all].sort(() => Math.random() - 0.5);
        problemIds = shuffled.slice(0, 20).map((p) => p.id);
        break;
      }
      case 'placement': {
        // Interview-oriented - favor weak and unfamiliar
        const allMastery = await getDueProblems();
        const weak = await getWeakProblems();
        const combined = [...new Set([...weak.map(w => w.problemId), ...allMastery.map(m => m.problemId)])];
        const shuffled = combined.sort(() => Math.random() - 0.5);
        problemIds = shuffled.slice(0, 25);
        break;
      }
      case 'continue': {
        if (initialProblemId) {
          // Start from the last problem
          const due = await getDueProblems();
          const dueIds = due.map((m) => m.problemId);
          const idx = dueIds.indexOf(initialProblemId);
          if (idx >= 0) {
            problemIds = [...dueIds.slice(idx), ...dueIds.slice(0, idx)];
          } else {
            problemIds = [initialProblemId, ...dueIds];
          }
        } else {
          const due = await getDueProblems();
          problemIds = due.map((m) => m.problemId);
        }
        break;
      }
    }

    // Fallback: if no problems, load all
    if (problemIds.length === 0) {
      const all = await getAllProblems();
      problemIds = all.map((p) => p.id);
    }

    setQueue(problemIds);
    setLoading(false);
  }, [mode, topicId, initialProblemId]);

  useEffect(() => {
    buildQueue();
  }, [buildQueue]);

  // Load current problem
  const loadProblem = useCallback(async (problemId: string) => {
    const p = await getProblem(problemId);
    const m = await getMastery(problemId);
    setProblem(p || null);
    setMastery(m || null);
    setRevealed(false);
    setShowApproach(false);
    setShowCode(false);
    setRated(false);
    setTimer(0);
    setTimerActive(true);

    // Save resume state
    setCurrentProblem(problemId, p?.topicId || null);
    setReviewCursor(cursor);
  }, [cursor]);

  useEffect(() => {
    if (queue.length > 0 && cursor < queue.length) {
      loadProblem(queue[cursor]);
    }
  }, [queue, cursor, loadProblem]);

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Navigate
  const goNext = () => {
    if (cursor < queue.length - 1) {
      setCursor((c) => c + 1);
    }
  };

  const goPrev = () => {
    if (cursor > 0) {
      setCursor((c) => c - 1);
    }
  };

  // Rate recall
  const handleRate = async (rating: RecallRating) => {
    if (!problem || !mastery || rated) return;

    setRated(true);
    setTimerActive(false);

    // Update mastery
    const updatedMastery = updateMasteryAfterReview(mastery, rating);
    const xpEarned = (updatedMastery as any)._xpEarned || 0;
    const gapDays = (updatedMastery as any)._gapDays || 0;
    const wasOverdue = (updatedMastery as any)._wasOverdue || false;

    // Clean temp fields
    const cleanMastery = { ...updatedMastery };
    delete (cleanMastery as any)._xpEarned;
    delete (cleanMastery as any)._gapDays;
    delete (cleanMastery as any)._wasOverdue;
    delete (cleanMastery as any)._isFirstReview;

    await putMastery(cleanMastery);
    setMastery(cleanMastery);

    // Save review record
    await putReview({
      id: `review-${problem.id}-${Date.now()}`,
      problemId: problem.id,
      topicId: problem.topicId,
      rating,
      timestamp: Date.now(),
      xpEarned,
      wasOverdue,
      gapDays,
    });

    // Update stats
    const stats = await getStats();
    const streakInfo = updateStreak(stats.lastActiveDate, stats.currentStreak);
    const newTotalXP = stats.totalXP + xpEarned;

    await putStats({
      ...stats,
      totalXP: newTotalXP,
      level: levelFromXP(newTotalXP),
      currentStreak: streakInfo.streak,
      longestStreak: Math.max(stats.longestStreak, streakInfo.streak),
      lastActiveDate: new Date().toISOString().split('T')[0],
      totalReviews: stats.totalReviews + 1,
    });

    onXPGain(xpEarned);
    onStatsUpdate();

    // Auto-advance after brief delay
    setTimeout(() => {
      if (cursor < queue.length - 1) {
        goNext();
      }
    }, 1500);
  };

  // Bookmark toggle
  const toggleBookmark = async () => {
    if (!mastery) return;
    const updated = { ...mastery, isBookmarked: !mastery.isBookmarked };
    await putMastery(updated);
    setMastery(updated);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Preparing your review queue...</p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="empty-state animate-in">
        <div className="empty-state-icon">🎉</div>
        <h3>All Caught Up!</h3>
        <p>No problems to review right now. Check back later or try a different study mode.</p>
        <button className="btn btn-primary btn-lg" onClick={() => onNavigate('dashboard')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading problem...</p>
      </div>
    );
  }

  const modeLabels: Record<StudyMode, string> = {
    continue: 'Continue Session',
    due_today: "Today's Due",
    topic_run: 'Topic Run',
    weak_problems: 'Weak Problems',
    boss_round: 'Boss Round',
    placement: 'Placement Mode',
  };

  return (
    <div className="review-player animate-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => onNavigate('dashboard')}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{modeLabels[mode]}</div>
          {mode === 'boss_round' && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-secondary)', marginBottom: '4px' }}>
              Randomized challenge spanning all topics
            </div>
          )}
          {mode === 'placement' && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent-secondary)', marginBottom: '4px' }}>
              Interview simulation prioritizing weak and unfamiliar problems
            </div>
          )}
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
            {problem.topic}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
          <Clock size={14} />
          {formatTime(timer)}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="review-progress-bar">
        <span>{cursor + 1}</span>
        <div className="progress-bar-wrapper">
          <div
            className="progress-bar-fill"
            style={{ width: `${((cursor + 1) / queue.length) * 100}%` }}
          />
        </div>
        <span>{queue.length}</span>
      </div>

      {/* Problem Card */}
      <div className="glass-card review-card slide-in" key={problem.id}>
        <div className="review-card-topic">{problem.topic}</div>
        <h2 className="review-card-title">{problem.title}</h2>

        <div className="review-card-meta">
          {mastery && (
            <span className={`mastery-badge ${mastery.level}`}>
              {mastery.level.replace('_', ' ')}
            </span>
          )}
          {mastery && mastery.reviewCount > 0 && (
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              Reviewed {mastery.reviewCount}x
            </span>
          )}
          {mastery && mastery.lastReviewedAt && (
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              Last: {new Date(mastery.lastReviewedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Problem Summary (Always visible) */}
        {problem.summary && (
          <div className="review-solution-section" style={{ marginTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div className="section-content" style={{ fontSize: 'var(--fs-md)', lineHeight: 1.6 }}>
              {problem.summary}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="review-card-actions">
          {!revealed && (
            <>
              {problem.approach && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowApproach(!showApproach)}
                >
                  <Lightbulb size={16} />
                  {showApproach ? 'Hide Hint' : 'Show Hint'}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setRevealed(true)}>
                <Eye size={16} />
                Reveal Solution
              </button>
            </>
          )}
          {revealed && (
            <button className="btn btn-secondary" onClick={() => setRevealed(false)}>
              <EyeOff size={16} />
              Hide Solution
            </button>
          )}
          <button
            className={`btn ${mastery?.isBookmarked ? 'btn-primary' : 'btn-ghost'} btn-icon`}
            onClick={toggleBookmark}
            title={mastery?.isBookmarked ? 'Unbookmark' : 'Bookmark'}
          >
            {mastery?.isBookmarked ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
          </button>
        </div>

        {/* Hint (approach) */}
        {showApproach && !revealed && problem.approach && (
          <div className="review-solution animate-in">
            <div className="review-solution-section">
              <h3><Lightbulb size={14} /> Approach Hint</h3>
              <div className="section-content">{problem.approach}</div>
            </div>
          </div>
        )}

        {/* Full Solution */}
        {revealed && (
          <div className="review-solution animate-in">
            {problem.approach && (
              <div className="review-solution-section">
                <h3>💡 Approach</h3>
                <div className="section-content">{problem.approach}</div>
              </div>
            )}
            {problem.pseudoCode && (
              <div className="review-solution-section">
                <h3 style={{ cursor: 'pointer' }} onClick={() => setShowCode(!showCode)}>
                  <Code size={14} /> Code {showCode ? '▾' : '▸'}
                </h3>
                {showCode && (
                  <div className="code-block">
                    <code>{extractCode(problem.pseudoCode)}</code>
                  </div>
                )}
              </div>
            )}
            {problem.complexity && (
              <div className="review-solution-section">
                <h3>⏱️ Complexity</h3>
                <div className="section-content">{problem.complexity}</div>
              </div>
            )}
            {problem.notes && !problem.summary && !problem.approach && (
              <div className="review-solution-section">
                <h3>📝 Notes</h3>
                <div className="section-content" style={{ whiteSpace: 'pre-wrap' }}>{problem.notes}</div>
              </div>
            )}
          </div>
        )}

        {/* Rating Section */}
        {revealed && !rated && (
          <div className="review-rating-section animate-in">
            <div className="review-rating-label">How well did you recall this?</div>
            <div className="rating-buttons">
              <button className="rating-btn blank" onClick={() => handleRate('blank')}>
                😵 Blank
                <span className="rating-label">Forgot everything</span>
              </button>
              <button className="rating-btn vague" onClick={() => handleRate('vague')}>
                🤔 Vague
                <span className="rating-label">Partial recall</span>
              </button>
              <button className="rating-btn explain" onClick={() => handleRate('can_explain')}>
                💬 Can Explain
                <span className="rating-label">Know the approach</span>
              </button>
              <button className="rating-btn code" onClick={() => handleRate('can_code')}>
                💻 Can Code
                <span className="rating-label">Ready to implement</span>
              </button>
            </div>
          </div>
        )}

        {/* Post-rating feedback */}
        {rated && mastery && (
          <div className="review-rating-section animate-in" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--fs-lg)', marginBottom: 'var(--space-md)' }}>
              {mastery.level === 'interview_ready' ? '🏆' : mastery.level === 'strong' ? '💪' : mastery.level === 'familiar' ? '👍' : '📚'}
            </div>
            <div className={`mastery-badge ${mastery.level}`} style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-sm)' }}>
              {mastery.level.replace('_', ' ')}
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
              Next review: {mastery.nextDueDate ? new Date(mastery.nextDueDate).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-xl)' }}>
        <button
          className="btn btn-secondary"
          onClick={goPrev}
          disabled={cursor === 0}
          style={{ opacity: cursor === 0 ? 0.5 : 1 }}
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <button
          className="btn btn-secondary"
          onClick={goNext}
          disabled={cursor >= queue.length - 1}
          style={{ opacity: cursor >= queue.length - 1 ? 0.5 : 1 }}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// Extract code from markdown-style code blocks
function extractCode(text: string): string {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (match) return match[1].trim();
  return text;
}

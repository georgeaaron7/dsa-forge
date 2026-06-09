import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { Problem, MasteryRecord, ViewName, StudyMode } from '../types';
import { getWeakProblems, getAllProblems } from '../lib/db';

interface WeakProblemsProps {
  onNavigate: (view: ViewName, mode?: StudyMode, topicId?: string) => void;
}

interface WeakProblem {
  problem: Problem;
  mastery: MasteryRecord;
}

export default function WeakProblems({ onNavigate }: WeakProblemsProps) {
  const [weakProblems, setWeakProblems] = useState<WeakProblem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [weakMastery, allProblems] = await Promise.all([
        getWeakProblems(),
        getAllProblems(),
      ]);

      const problemMap = new Map(allProblems.map((p) => [p.id, p]));
      const wp: WeakProblem[] = weakMastery
        .map((m) => {
          const problem = problemMap.get(m.problemId);
          if (!problem) return null;
          return { problem, mastery: m };
        })
        .filter(Boolean) as WeakProblem[];

      // Sort by worst first
      wp.sort((a, b) => {
        const levelOrder = { new: 0, learning: 1, familiar: 2, strong: 3, interview_ready: 4 };
        return levelOrder[a.mastery.level] - levelOrder[b.mastery.level];
      });

      setWeakProblems(wp);
    } catch (err) {
      console.error('Failed to load weak problems:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Finding weak spots...</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">
          <AlertTriangle size={24} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-warning)' }} />
          Weak Problems
        </h1>
        <p className="page-subtitle">
          {weakProblems.length} problems need your attention
        </p>
      </div>

      {weakProblems.length > 0 && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => onNavigate('review', 'weak_problems')}
          >
            🎯 Start Weak Review ({weakProblems.length} problems)
          </button>
        </div>
      )}

      {weakProblems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💪</div>
          <h3>No Weak Problems!</h3>
          <p>Great job! All your problems are in good shape. Keep reviewing to maintain your mastery.</p>
        </div>
      ) : (
        <div className="problem-list">
          {weakProblems.map((wp, i) => (
            <div
              key={wp.problem.id}
              className={`problem-list-item animate-in-delay-${Math.min(i % 3 + 1, 3)}`}
              onClick={() => onNavigate('review', 'weak_problems')}
            >
              <span className="problem-number">{i + 1}</span>
              <span className="problem-title">{wp.problem.title}</span>
              <div className="problem-meta">
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  {wp.problem.topic}
                </span>
                <span className={`mastery-badge ${wp.mastery.level}`}>
                  {wp.mastery.level.replace('_', ' ')}
                </span>
                {wp.mastery.isWeak && (
                  <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                )}
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

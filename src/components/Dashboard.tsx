import { useEffect, useState, useCallback } from 'react';
import {
  Zap,
  Flame,
  Calendar,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Trophy,
  Target,
  ChevronRight,
} from 'lucide-react';
import type { UserStats, Topic, Review, ViewName, StudyMode } from '../types';
import { getAllTopics, getDueProblems, getWeakProblems, getAllMastery, getRecentReviews, getAllProblems } from '../lib/db';
import { calculateTopicMastery, calculateInterviewReadiness, xpForCurrentLevel } from '../lib/spacedRepetition';

interface DashboardProps {
  stats: UserStats;
  onNavigate: (view: ViewName, mode?: StudyMode, topicId?: string) => void;
  resumeProblemId: string | null;
  resumeTopicId: string | null;
}

interface TopicWithMastery {
  topic: Topic;
  mastery: number;
  dueCount: number;
  totalProblems: number;
}

export default function Dashboard({ stats, onNavigate, resumeProblemId }: DashboardProps) {
  const [dueCount, setDueCount] = useState(0);
  const [weakCount, setWeakCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [topicsMastery, setTopicsMastery] = useState<TopicWithMastery[]>([]);
  const [recentReviews, setRecentReviews] = useState<(Review & { problemTitle?: string })[]>([]);
  const [interviewReadiness, setInterviewReadiness] = useState(0);
  const [totalProblems, setTotalProblems] = useState(0);
  const [reviewedProblems, setReviewedProblems] = useState(0);

  const loadDashboardData = useCallback(async () => {
    try {
      const [due, weak, topics, allMastery, recent, problems] = await Promise.all([
        getDueProblems(),
        getWeakProblems(),
        getAllTopics(),
        getAllMastery(),
        getRecentReviews(5),
        getAllProblems(),
      ]);

      setDueCount(due.length);
      setWeakCount(weak.length);
      setTotalProblems(problems.length);

      const now = Date.now();
      const overdue = due.filter((m) => m.nextDueDate !== null && m.nextDueDate < now - 24 * 60 * 60 * 1000);
      setOverdueCount(overdue.length);

      const reviewed = allMastery.filter((m) => m.reviewCount > 0).length;
      setReviewedProblems(reviewed);

      setInterviewReadiness(calculateInterviewReadiness(allMastery));

      // Topic mastery
      const topicData: TopicWithMastery[] = topics.map((t) => {
        const topicMasteries = allMastery.filter((m) => m.topicId === t.id);
        const topicDue = due.filter((m) => m.topicId === t.id);
        return {
          topic: t,
          mastery: calculateTopicMastery(topicMasteries),
          dueCount: topicDue.length,
          totalProblems: topicMasteries.length,
        };
      });
      setTopicsMastery(topicData);

      // Enrich recent reviews with problem titles
      const problemMap = new Map(problems.map((p) => [p.id, p]));
      const enrichedReviews = recent.map((r) => ({
        ...r,
        problemTitle: problemMap.get(r.problemId)?.title || 'Unknown Problem',
      }));
      setRecentReviews(enrichedReviews);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const xpProgress = xpForCurrentLevel(stats.totalXP);
  const weakestTopics = [...topicsMastery].sort((a, b) => a.mastery - b.mastery).slice(0, 3);
  const passProgress = totalProblems > 0 ? Math.round((reviewedProblems / totalProblems) * 100) : 0;

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your DSA interview prep at a glance</p>
      </div>

      {/* Continue Banner */}
      {resumeProblemId && (
        <div
          className="continue-banner animate-in-delay-1"
          onClick={() => onNavigate('review', 'continue')}
        >
          <div className="continue-banner-content">
            <h3>⚡ Continue Where You Left Off</h3>
            <p>Resume your study session right from your last problem</p>
          </div>
          <button className="btn btn-primary">
            Resume <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="stat-grid animate-in-delay-1" style={{ marginBottom: 'var(--space-2xl)' }}>
        <div className="glass-card stat-card">
          <div className="stat-card-icon xp">
            <Zap size={20} />
          </div>
          <div className="stat-card-value">{stats.totalXP.toLocaleString()}</div>
          <div className="stat-card-label">Total XP · Level {stats.level}</div>
          <div className="progress-bar-wrapper" style={{ marginTop: '8px' }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${(xpProgress.current / xpProgress.required) * 100}%` }}
            />
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
            {xpProgress.current} / {xpProgress.required} XP to next level
          </div>
        </div>

        <div className="glass-card stat-card glow-streak">
          <div className="stat-card-icon streak">
            <Flame size={20} />
          </div>
          <div className="stat-card-value">
            {stats.currentStreak > 0 && <span className="streak-flame">🔥</span>} {stats.currentStreak}
          </div>
          <div className="stat-card-label">Day Streak</div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '8px' }}>
            Best: {stats.longestStreak} days
          </div>
        </div>

        <div
          className="glass-card stat-card clickable"
          onClick={() => onNavigate('review', 'due_today')}
        >
          <div className="stat-card-icon due">
            <Calendar size={20} />
          </div>
          <div className="stat-card-value">{dueCount}</div>
          <div className="stat-card-label">Due Today</div>
          {overdueCount > 0 && (
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-warning)', marginTop: '8px' }}>
              ⚠️ {overdueCount} overdue
            </div>
          )}
        </div>

        <div className="glass-card stat-card">
          <div className="stat-card-icon mastery">
            <Target size={20} />
          </div>
          <div className="stat-card-value">{interviewReadiness}%</div>
          <div className="stat-card-label">Interview Readiness</div>
          <div className="progress-bar-wrapper" style={{ marginTop: '8px' }}>
            <div
              className="progress-bar-fill success"
              style={{ width: `${interviewReadiness}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section-header animate-in-delay-2">
        <h2 className="section-title">Quick Actions</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }} className="animate-in-delay-2">
        <button
          className="glass-card clickable"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}
          onClick={() => onNavigate('review', 'due_today')}
        >
          <Calendar size={20} style={{ color: 'var(--accent-primary)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Today's Due</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>{dueCount} problems</div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </button>

        <button
          className="glass-card clickable"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}
          onClick={() => onNavigate('weak')}
        >
          <AlertTriangle size={20} style={{ color: 'var(--color-warning)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Weak Problems</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>{weakCount} need review</div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </button>

        <button
          className="glass-card clickable"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}
          onClick={() => onNavigate('topics')}
        >
          <BookOpen size={20} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Topic Run</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Pick a topic</div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </button>

        <button
          className="glass-card clickable"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-lg)' }}
          onClick={() => onNavigate('placement')}
        >
          <Trophy size={20} style={{ color: 'var(--accent-secondary)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>Placement Mode</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>Interview sim</div>
          </div>
          <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Pass Progress */}
      <div className="glass-card animate-in-delay-2" style={{ marginBottom: 'var(--space-2xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>📊 Pass Progress</h3>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>
            {reviewedProblems} / {totalProblems} reviewed
          </span>
        </div>
        <div className="progress-bar-wrapper" style={{ height: '10px' }}>
          <div
            className="progress-bar-fill"
            style={{ width: `${passProgress}%` }}
          />
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
          Pass 1 — {passProgress}% complete
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-xl)' }} className="animate-in-delay-3">
        {/* Weakest Topics */}
        <div className="glass-card">
          <div className="section-header" style={{ marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>⚠️ Weakest Topics</h3>
          </div>
          {weakestTopics.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>No data yet</p>
          ) : (
            weakestTopics.map((t) => (
              <div
                key={t.topic.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-sm) 0',
                  cursor: 'pointer',
                }}
                onClick={() => onNavigate('review', 'topic_run', t.topic.id)}
              >
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500 }}>{t.topic.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <div className="progress-bar-wrapper" style={{ width: '80px' }}>
                    <div
                      className="progress-bar-fill warning"
                      style={{ width: `${t.mastery}%` }}
                    />
                  </div>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>{t.mastery}%</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-card">
          <div className="section-header" style={{ marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>🕐 Recent Reviews</h3>
          </div>
          {recentReviews.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>No reviews yet. Start studying!</p>
          ) : (
            recentReviews.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-sm) 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.problemTitle}
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                    {new Date(r.timestamp).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span className={`mastery-badge ${r.rating === 'blank' ? 'new' : r.rating === 'vague' ? 'learning' : r.rating === 'can_explain' ? 'familiar' : 'interview_ready'}`}>
                    {r.rating.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--xp-gold)', fontWeight: 700 }}>+{r.xpEarned}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Topic Mastery Overview */}
      <div style={{ marginTop: 'var(--space-2xl)' }} className="animate-in-delay-3">
        <div className="section-header">
          <h2 className="section-title">📚 Topic Mastery</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('topics')}>
            View All <ChevronRight size={14} />
          </button>
        </div>
        <div className="topic-grid">
          {topicsMastery.map((t) => (
            <div
              key={t.topic.id}
              className="glass-card clickable topic-card"
              onClick={() => onNavigate('review', 'topic_run', t.topic.id)}
            >
              <div className="topic-card-header">
                <span className="topic-card-name">{t.topic.name}</span>
                <span className="topic-card-count">{t.totalProblems} problems</span>
              </div>
              <div className="progress-bar-wrapper">
                <div
                  className={`progress-bar-fill ${t.mastery >= 70 ? 'success' : t.mastery >= 40 ? '' : 'warning'}`}
                  style={{ width: `${t.mastery}%` }}
                />
              </div>
              <div className="topic-card-stats">
                <span className="topic-card-stat"><strong>{t.mastery}%</strong> mastery</span>
                {t.dueCount > 0 && (
                  <span className="topic-card-stat" style={{ color: 'var(--color-warning)' }}>
                    <strong>{t.dueCount}</strong> due
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

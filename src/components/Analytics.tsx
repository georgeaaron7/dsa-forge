import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Calendar, TrendingUp, Zap, BookOpen, Target } from 'lucide-react';
import type { Review, MasteryRecord, Topic } from '../types';
import { getAllReviews, getAllMastery, getAllTopics } from '../lib/db';
import { calculateTopicMastery, calculateInterviewReadiness } from '../lib/spacedRepetition';

export default function Analytics() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [mastery, setMastery] = useState<MasteryRecord[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r, m, t] = await Promise.all([
        getAllReviews(),
        getAllMastery(),
        getAllTopics(),
      ]);
      setReviews(r);
      setMastery(m);
      setTopics(t);
    } catch (err) {
      console.error('Failed to load analytics:', err);
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
        <p>Loading analytics...</p>
      </div>
    );
  }

  // ─── Compute analytics ────────────────────────
  const totalReviews = reviews.length;
  const totalXP = reviews.reduce((sum, r) => sum + r.xpEarned, 0);
  const readiness = calculateInterviewReadiness(mastery);

  // Rating distribution
  const ratingCounts = { blank: 0, vague: 0, can_explain: 0, can_code: 0 };
  reviews.forEach((r) => { ratingCounts[r.rating]++; });

  // Mastery distribution
  const masteryCounts = { new: 0, learning: 0, familiar: 0, strong: 0, interview_ready: 0 };
  mastery.forEach((m) => { masteryCounts[m.level]++; });

  // Per-topic mastery
  const topicStats = topics.map((t) => {
    const topicMastery = mastery.filter((m) => m.topicId === t.id);
    return {
      name: t.name,
      mastery: calculateTopicMastery(topicMastery),
      total: topicMastery.length,
      reviewed: topicMastery.filter((m) => m.reviewCount > 0).length,
    };
  }).sort((a, b) => b.mastery - a.mastery);

  // Heatmap: last 12 weeks (84 days)
  const heatmapDays = 84;
  const dayMap = new Map<string, number>();
  reviews.forEach((r) => {
    const day = new Date(r.timestamp).toISOString().split('T')[0];
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  });

  const heatmapCells: { date: string; count: number }[] = [];
  for (let i = heatmapDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    heatmapCells.push({ date: dateStr, count: dayMap.get(dateStr) || 0 });
  }

  const maxDayCount = Math.max(...heatmapCells.map((c) => c.count), 1);
  const getHeatmapLevel = (count: number) => {
    if (count === 0) return '';
    if (count <= maxDayCount * 0.25) return 'level-1';
    if (count <= maxDayCount * 0.5) return 'level-2';
    if (count <= maxDayCount * 0.75) return 'level-3';
    return 'level-4';
  };

  // Reviews per day (recent 7 days)
  const last7Days: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
    last7Days.push({ day: dayLabel, count: dayMap.get(dateStr) || 0 });
  }
  const max7Day = Math.max(...last7Days.map((d) => d.count), 1);

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">
          <BarChart3 size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Analytics
        </h1>
        <p className="page-subtitle">Track your learning progress and patterns</p>
      </div>

      {/* Summary Stats */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-2xl)' }}>
        <div className="glass-card stat-card">
          <div className="stat-card-icon due"><BookOpen size={20} /></div>
          <div className="stat-card-value">{totalReviews}</div>
          <div className="stat-card-label">Total Reviews</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-icon xp"><Zap size={20} /></div>
          <div className="stat-card-value">{totalXP.toLocaleString()}</div>
          <div className="stat-card-label">XP Earned</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-icon mastery"><Target size={20} /></div>
          <div className="stat-card-value">{readiness}%</div>
          <div className="stat-card-label">Interview Readiness</div>
        </div>
        <div className="glass-card stat-card">
          <div className="stat-card-icon streak"><TrendingUp size={20} /></div>
          <div className="stat-card-value">
            {mastery.filter((m) => m.level === 'interview_ready' || m.level === 'strong').length}
          </div>
          <div className="stat-card-label">Strong / Ready Problems</div>
        </div>
      </div>

      <div className="analytics-grid">
        {/* Activity Heatmap */}
        <div className="glass-card animate-in-delay-1">
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
            <Calendar size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            Activity Heatmap
          </h3>
          <div className="heatmap-grid">
            {heatmapCells.map((cell) => (
              <div
                key={cell.date}
                className={`heatmap-cell ${getHeatmapLevel(cell.count)}`}
                title={`${cell.date}: ${cell.count} reviews`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginTop: 'var(--space-sm)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginRight: '4px' }}>Less</span>
            <div className="heatmap-cell" style={{ width: '12px', height: '12px' }} />
            <div className="heatmap-cell level-1" style={{ width: '12px', height: '12px' }} />
            <div className="heatmap-cell level-2" style={{ width: '12px', height: '12px' }} />
            <div className="heatmap-cell level-3" style={{ width: '12px', height: '12px' }} />
            <div className="heatmap-cell level-4" style={{ width: '12px', height: '12px' }} />
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginLeft: '4px' }}>More</span>
          </div>
        </div>

        {/* Weekly Activity */}
        <div className="glass-card animate-in-delay-2">
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
            📊 This Week
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', height: '120px' }}>
            {last7Days.map((d) => (
              <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '40px',
                    height: `${Math.max(4, (d.count / max7Day) * 100)}px`,
                    background: d.count > 0
                      ? 'linear-gradient(180deg, var(--accent-primary), var(--accent-secondary))'
                      : 'var(--bg-glass)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'height var(--transition-slow)',
                  }}
                />
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="glass-card animate-in-delay-2">
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
            🎯 Rating Distribution
          </h3>
          {Object.entries(ratingCounts).map(([rating, count]) => {
            const colors: Record<string, string> = {
              blank: 'var(--rating-blank)',
              vague: 'var(--rating-vague)',
              can_explain: 'var(--rating-explain)',
              can_code: 'var(--rating-code)',
            };
            const labels: Record<string, string> = {
              blank: 'Blank',
              vague: 'Vague',
              can_explain: 'Can Explain',
              can_code: 'Can Code',
            };
            const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
            return (
              <div key={rating} style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '4px' }}>
                  <span style={{ color: colors[rating], fontWeight: 600 }}>{labels[rating]}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                </div>
                <div className="progress-bar-wrapper">
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: colors[rating],
                      borderRadius: 'var(--radius-full)',
                      transition: 'width var(--transition-slow)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Mastery Distribution */}
        <div className="glass-card animate-in-delay-3">
          <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
            📈 Mastery Distribution
          </h3>
          {Object.entries(masteryCounts).map(([level, count]) => {
            const colors: Record<string, string> = {
              new: 'var(--mastery-new)',
              learning: 'var(--mastery-learning)',
              familiar: 'var(--mastery-familiar)',
              strong: 'var(--mastery-strong)',
              interview_ready: 'var(--mastery-ready)',
            };
            const labels: Record<string, string> = {
              new: 'New',
              learning: 'Learning',
              familiar: 'Familiar',
              strong: 'Strong',
              interview_ready: 'Interview Ready',
            };
            const pct = mastery.length > 0 ? Math.round((count / mastery.length) * 100) : 0;
            return (
              <div key={level} style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '4px' }}>
                  <span style={{ color: colors[level], fontWeight: 600 }}>{labels[level]}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                </div>
                <div className="progress-bar-wrapper">
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: colors[level],
                      borderRadius: 'var(--radius-full)',
                      transition: 'width var(--transition-slow)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Topic Leaderboard */}
      <div className="glass-card animate-in-delay-3" style={{ marginTop: 'var(--space-2xl)' }}>
        <h3 style={{ fontSize: 'var(--fs-md)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
          🏆 Topic Mastery Leaderboard
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          {topicStats.map((t, i) => (
            <div
              key={t.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-sm) 0',
                borderBottom: i < topicStats.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <span style={{
                fontSize: 'var(--fs-sm)',
                fontWeight: 700,
                color: i === 0 ? 'var(--xp-gold)' : i === 1 ? 'var(--text-secondary)' : i === 2 ? 'var(--streak-flame)' : 'var(--text-muted)',
                minWidth: '24px',
              }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 'var(--fs-sm)', fontWeight: 500 }}>{t.name}</span>
              <div className="progress-bar-wrapper" style={{ width: '120px' }}>
                <div
                  className={`progress-bar-fill ${t.mastery >= 70 ? 'success' : t.mastery >= 40 ? '' : 'warning'}`}
                  style={{ width: `${t.mastery}%` }}
                />
              </div>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'right' }}>
                {t.mastery}%
              </span>
              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                {t.reviewed}/{t.total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

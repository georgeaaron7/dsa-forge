import { useState, useEffect, useCallback, useRef } from 'react';
import type { ViewName, StudyMode, UserStats } from './types';
import { getStats, getDueProblems, getWeakProblems } from './lib/db';
import { ingestAllCSVs } from './lib/ingestion';
import { getResumeState, setCurrentView, setCurrentMode, saveResumeState } from './lib/resumeState';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ReviewPlayer from './components/ReviewPlayer';
import TopicExplorer from './components/TopicExplorer';
import WeakProblems from './components/WeakProblems';
import Analytics from './components/Analytics';
import SettingsView from './components/Settings';

const defaultStats: UserStats = {
  totalXP: 0,
  level: 1,
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  totalReviews: 0,
  badges: [],
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentView, setView] = useState<ViewName>('dashboard');
  const [currentMode, setMode] = useState<StudyMode | null>(null);
  const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
  const [resumeProblemId, setResumeProblemId] = useState<string | null>(null);
  const [resumeCursor, setResumeCursor] = useState(0);
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [dueCount, setDueCount] = useState(0);
  const [weakCount, setWeakCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [xpBursts, setXpBursts] = useState<{ id: number; amount: number; x: number; y: number }[]>([]);
  const burstIdRef = useRef(0);

  // ─── Initialize ─────────────────────────────────────────
  const initialize = useCallback(async () => {
    try {
      // Ingest CSVs (no-op if already done)
      await ingestAllCSVs();

      // Restore resume state
      const resume = getResumeState();
      setView(resume.currentView || 'dashboard');
      setMode(resume.currentMode);
      setCurrentTopicId(resume.currentTopicId);
      setResumeProblemId(resume.currentProblemId);
      setResumeCursor(resume.reviewQueueCursor || 0);

      // Load stats
      await refreshStats();
    } catch (err) {
      console.error('Initialization failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // ─── Refresh stats ──────────────────────────────────────
  const refreshStats = async () => {
    try {
      const [s, due, weak] = await Promise.all([
        getStats(),
        getDueProblems(),
        getWeakProblems(),
      ]);
      setStats(s);
      setDueCount(due.length);
      setWeakCount(weak.length);
    } catch (err) {
      console.error('Failed to refresh stats:', err);
    }
  };

  // ─── Navigation ─────────────────────────────────────────
  const handleNavigate = (view: ViewName, mode?: StudyMode, topicId?: string) => {
    setView(view);
    setCurrentView(view);

    if (mode) {
      setMode(mode);
      setCurrentMode(mode);
    }

    if (topicId) {
      setCurrentTopicId(topicId);
      saveResumeState({ currentTopicId: topicId });
    }

    // If navigating to review with a mode, we start fresh
    if (view === 'review' && mode && mode !== 'continue') {
      setResumeProblemId(null);
      setResumeCursor(0);
    }
  };

  // ─── XP Burst ───────────────────────────────────────────
  const handleXPGain = (xp: number) => {
    const id = burstIdRef.current++;
    const x = window.innerWidth / 2 + Math.random() * 100 - 50;
    const y = window.innerHeight / 2;
    setXpBursts((prev) => [...prev, { id, amount: xp, x, y }]);
    setTimeout(() => {
      setXpBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1500);
  };

  // ─── Loading Screen ─────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-screen">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            boxShadow: 'var(--shadow-glow-accent)',
          }}>
            ⚡
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 'var(--fs-xl)', fontWeight: 700, marginBottom: '8px' }}>DSA Forge</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs-sm)' }}>Loading your revision platform...</p>
          </div>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  // ─── Render View ────────────────────────────────────────
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            stats={stats}
            onNavigate={handleNavigate}
            resumeProblemId={resumeProblemId}
            resumeTopicId={currentTopicId}
          />
        );
      case 'review':
        return (
          <ReviewPlayer
            mode={currentMode || 'due_today'}
            topicId={currentTopicId}
            initialProblemId={resumeProblemId}
            initialCursor={resumeCursor}
            onNavigate={(view) => handleNavigate(view)}
            onXPGain={handleXPGain}
            onStatsUpdate={refreshStats}
          />
        );
      case 'topics':
        return <TopicExplorer onNavigate={handleNavigate} />;
      case 'weak':
        return <WeakProblems onNavigate={handleNavigate} />;
      case 'boss':
        return (
          <ReviewPlayer
            mode="boss_round"
            topicId={null}
            initialProblemId={null}
            initialCursor={0}
            onNavigate={(view) => handleNavigate(view)}
            onXPGain={handleXPGain}
            onStatsUpdate={refreshStats}
          />
        );
      case 'placement':
        return (
          <ReviewPlayer
            mode="placement"
            topicId={null}
            initialProblemId={null}
            initialCursor={0}
            onNavigate={(view) => handleNavigate(view)}
            onXPGain={handleXPGain}
            onStatsUpdate={refreshStats}
          />
        );
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <Dashboard
            stats={stats}
            onNavigate={handleNavigate}
            resumeProblemId={resumeProblemId}
            resumeTopicId={currentTopicId}
          />
        );
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        activeView={currentView}
        onNavigate={(view) => handleNavigate(view)}
        stats={stats}
        dueCount={dueCount}
        weakCount={weakCount}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className="app-main">
        <div className="app-content">
          {renderView()}
        </div>
      </main>

      {/* XP Bursts */}
      {xpBursts.map((burst) => (
        <div
          key={burst.id}
          className="xp-burst"
          style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
        >
          +{burst.amount} XP ⚡
        </div>
      ))}
    </div>
  );
}

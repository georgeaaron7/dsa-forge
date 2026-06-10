import { useState, useEffect, useCallback, useRef } from 'react';
import type { ViewName, StudyMode, UserStats } from './types';
import { getStats, getDueProblems, getWeakProblems } from './lib/db';
import { ingestAllCSVs } from './lib/ingestion';
import { getResumeState, setCurrentView, setCurrentMode, saveResumeState } from './lib/resumeState';

// Supabase Import
import { supabase } from './lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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

  // ─── Listen for Auth State Changes ───────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Trigger Google Login Flow
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) console.error('OAuth initiation failed:', error.message);
  };

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

  // ─── Initialize Local DB (Only runs if Authenticated) ────
  const initialize = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      await ingestAllCSVs();

      const resume = getResumeState();
      setView(resume.currentView || 'dashboard');
      setMode(resume.currentMode);
      setCurrentTopicId(resume.currentTopicId);
      setResumeProblemId(resume.currentProblemId);
      setResumeCursor(resume.reviewQueueCursor || 0);

      await refreshStats();
    } catch (err) {
      console.error('Initialization failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) {
      initialize();
    }
  }, [user?.id, initialize]);

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
  if (authLoading || (user && loading)) {
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
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs-sm)' }}>
              {authLoading ? 'Verifying profile...' : 'Loading your revision platform...'}
            </p>
          </div>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  // ─── Unauthenticated Gatekeeper Screen ───────────────────
  if (!user) {
    return (
      <div className="loading-screen" style={{ flexDirection: 'column', gap: '32px', padding: 'var(--space-xl)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: 'var(--space-md)' }}>⚡</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.025em' }}>Welcome to DSA Forge</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', maxWidth: '320px', margin: '0 auto' }}>
            Sign in with Google to sync your metrics and practice streams.
          </p>
        </div>

        <button
          onClick={handleGoogleLogin}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: '#ffffff',
            color: '#11131c',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '12px',
            fontSize: 'var(--fs-md)',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02C6.21 7.59 8.87 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.43h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.65 2.83c2.13-1.97 3.36-4.87 3.36-8.51z" />
            <path fill="#FBBC05" d="M5.28 14.54c-.24-.72-.38-1.5-.38-2.31s.14-1.59.38-2.31L1.39 6.9C.5 8.71 0 10.74 0 12.87s.5 4.16 1.39 5.97l3.89-3.3z" />
            <path fill="#34A853" d="M12 23c3.24 0 5.97-1.08 7.96-2.93l-3.65-2.83c-1.01.68-2.31 1.08-3.96 1.08-3.13 0-5.79-2.55-6.74-5.54L.72 16.11C2.71 19.99 6.69 23 12 23z" />
          </svg>
          Continue with Google
        </button>
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
        return <SettingsView user={user} />;
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
        user={user}
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
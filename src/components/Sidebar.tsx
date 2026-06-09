import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  FolderOpen,
  AlertTriangle,
  Swords,
  Target,
  BarChart3,
  Settings,
  Flame,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import type { ViewName, UserStats } from '../types';

interface SidebarProps {
  activeView: ViewName;
  onNavigate: (view: ViewName) => void;
  stats: UserStats;
  dueCount: number;
  weakCount: number;
  isOpen: boolean;
  onToggle: () => void;
}

const navItems: { view: ViewName; label: string; icon: React.ReactNode; section: string }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} />, section: 'main' },
  { view: 'review', label: 'Review Session', icon: <BookOpen size={18} />, section: 'study' },
  { view: 'topics', label: 'Topic Explorer', icon: <FolderOpen size={18} />, section: 'study' },
  { view: 'weak', label: 'Weak Problems', icon: <AlertTriangle size={18} />, section: 'study' },
  { view: 'boss', label: 'Boss Round', icon: <Swords size={18} />, section: 'challenge' },
  { view: 'placement', label: 'Placement Mode', icon: <Target size={18} />, section: 'challenge' },
  { view: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} />, section: 'other' },
  { view: 'settings', label: 'Settings', icon: <Settings size={18} />, section: 'other' },
];

export default function Sidebar({ activeView, onNavigate, stats, dueCount, weakCount, isOpen, onToggle }: SidebarProps) {
  const sections = [
    { key: 'main', label: null },
    { key: 'study', label: 'Study' },
    { key: 'challenge', label: 'Challenge' },
    { key: 'other', label: 'More' },
  ];

  return (
    <>
      <button className="mobile-menu-toggle" onClick={onToggle}>
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onToggle} />

      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">⚡</div>
          <div>
            <span className="sidebar-logo-text">DSA Forge</span>
            <span className="sidebar-logo-sub">Interview Prep Platform</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {sections.map((section) => {
            const items = navItems.filter((n) => n.section === section.key);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={section.key}>
                {section.label && (
                  <div className="sidebar-section-label">{section.label}</div>
                )}
                {items.map((item) => (
                  <button
                    key={item.view}
                    className={`sidebar-nav-item ${activeView === item.view ? 'active' : ''}`}
                    onClick={() => {
                      onNavigate(item.view);
                      if (isOpen) onToggle();
                    }}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                    {item.view === 'review' && dueCount > 0 && (
                      <span className="sidebar-nav-badge urgent">{dueCount}</span>
                    )}
                    {item.view === 'weak' && weakCount > 0 && (
                      <span className="sidebar-nav-badge">{weakCount}</span>
                    )}
                  </button>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="sidebar-stats">
          <div className="sidebar-stat-item">
            <span><Zap size={12} /> XP</span>
            <span className="sidebar-stat-value">{stats.totalXP.toLocaleString()}</span>
          </div>
          <div className="sidebar-stat-item">
            <span><Flame size={12} /> Streak</span>
            <span className="sidebar-stat-value">
              {stats.currentStreak > 0 && <span className="streak-flame">🔥</span>}
              {stats.currentStreak}d
            </span>
          </div>
          <div className="sidebar-stat-item">
            <span>Level</span>
            <span className="sidebar-stat-value">{stats.level}</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 'auto',
            padding: 'var(--space-md)',
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
          }}
        >
          Made by{' '}
          <a
            href="https://www.linkedin.com/in/georgeaaron7/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            Aaron George
          </a>
        </div>
      </aside>
    </>
  );
}

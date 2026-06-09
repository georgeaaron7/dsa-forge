import { useState, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Download,
  Upload,
  Trash2,
  Database,
  HardDrive,
  RefreshCw,
  Check,
  AlertTriangle,
} from 'lucide-react';
import type { BackupData } from '../types';
import { getAllReviews, getAllMastery, getAllSessions, getStats, putStats, putMasteryBulk, putReview, clearAllData, getDataCounts } from '../lib/db';
import { forceReIngest } from '../lib/ingestion';
import { clearResumeState } from '../lib/resumeState';

export default function SettingsView() {
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [counts, setCounts] = useState<{ problems: number; topics: number; reviews: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reingesting, setReingesting] = useState(false);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const loadCounts = useCallback(async () => {
    const c = await getDataCounts();
    setCounts(c);
  }, []);

  useState(() => {
    loadCounts();
  });

  // ─── Export Progress ──────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const [reviews, mastery, sessions, stats] = await Promise.all([
        getAllReviews(),
        getAllMastery(),
        getAllSessions(),
        getStats(),
      ]);

      const backup: BackupData = {
        version: '1.0.0',
        exportedAt: Date.now(),
        stats,
        mastery,
        reviews,
        sessions,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dsa-forge-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showMessage('Progress exported successfully!', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      showMessage('Export failed. Check console for details.', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ─── Import Progress ──────────────────────────────────
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const backup: BackupData = JSON.parse(text);

        if (!backup.version || !backup.mastery || !backup.reviews) {
          throw new Error('Invalid backup format');
        }

        // Import mastery
        await putMasteryBulk(backup.mastery);

        // Import reviews
        for (const review of backup.reviews) {
          await putReview(review);
        }

        // Import stats
        if (backup.stats) {
          await putStats(backup.stats);
        }

        await loadCounts();
        showMessage(`Imported ${backup.reviews.length} reviews and ${backup.mastery.length} mastery records!`, 'success');
      } catch (err) {
        console.error('Import failed:', err);
        showMessage('Import failed. Make sure you selected a valid backup file.', 'error');
      }
    };
    input.click();
  };

  // ─── Clear All Data ───────────────────────────────────
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear ALL data? This cannot be undone. Consider exporting your progress first.')) {
      return;
    }
    if (!window.confirm('This will delete all your progress, reviews, and mastery data. Are you absolutely sure?')) {
      return;
    }

    try {
      await clearAllData();
      clearResumeState();
      await loadCounts();
      showMessage('All data cleared. Refresh the page to re-ingest questions.', 'success');
    } catch (err) {
      console.error('Clear failed:', err);
      showMessage('Failed to clear data.', 'error');
    }
  };

  // ─── Re-ingest Questions ──────────────────────────────
  const handleReIngest = async () => {
    if (!window.confirm('This will re-import all questions from the CSV files. Your review history will be preserved. Continue?')) {
      return;
    }

    setReingesting(true);
    try {
      const result = await forceReIngest();
      await loadCounts();
      showMessage(`Re-imported ${result.problems} problems across ${result.topics} topics.`, 'success');
    } catch (err) {
      console.error('Re-ingest failed:', err);
      showMessage('Re-ingest failed.', 'error');
    } finally {
      setReingesting(false);
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">
          <SettingsIcon size={24} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Settings
        </h1>
        <p className="page-subtitle">Manage your data, backups, and preferences</p>
      </div>

      {/* Toast */}
      {message && (
        <div className="toast-container">
          <div className={`toast ${message.type}`}>
            {message.type === 'success' ? <Check size={16} style={{ color: 'var(--color-success)' }} /> : <AlertTriangle size={16} style={{ color: 'var(--color-error)' }} />}
            {message.text}
          </div>
        </div>
      )}

      {/* Storage Stats */}
      <div className="settings-section">
        <h3>
          <Database size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Storage
        </h3>
        <div className="glass-card" style={{ marginTop: 'var(--space-md)' }}>
          {counts ? (
            <>
              <div className="settings-row">
                <span className="settings-row-label">Problems Loaded</span>
                <span style={{ fontWeight: 600 }}>{counts.problems}</span>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">Topics</span>
                <span style={{ fontWeight: 600 }}>{counts.topics}</span>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">Review Records</span>
                <span style={{ fontWeight: 600 }}>{counts.reviews}</span>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">
                  Storage Engine
                  <span>IndexedDB + localStorage</span>
                </span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-success)' }}>
                  <HardDrive size={12} /> Active
                </span>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>Loading...</p>
          )}
        </div>
      </div>

      {/* Backup & Recovery */}
      <div className="settings-section">
        <h3>
          <HardDrive size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Backup & Recovery
        </h3>
        <div className="glass-card" style={{ marginTop: 'var(--space-md)' }}>
          <div className="settings-row">
            <span className="settings-row-label">
              Export Progress
              <span>Download all your progress as a JSON file</span>
            </span>
            <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
              <Download size={16} />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">
              Import Progress
              <span>Restore progress from a backup file</span>
            </span>
            <button className="btn btn-secondary" onClick={handleImport}>
              <Upload size={16} />
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-section">
        <h3>
          <RefreshCw size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Data Management
        </h3>
        <div className="glass-card" style={{ marginTop: 'var(--space-md)' }}>
          <div className="settings-row">
            <span className="settings-row-label">
              Re-import Questions
              <span>Reload all CSV files from the questions folder</span>
            </span>
            <button className="btn btn-secondary" onClick={handleReIngest} disabled={reingesting}>
              <RefreshCw size={16} className={reingesting ? 'animate-spin' : ''} />
              {reingesting ? 'Re-importing...' : 'Re-import'}
            </button>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">
              Clear All Data
              <span>Permanently delete all progress and data</span>
            </span>
            <button className="btn btn-danger" onClick={handleClearAll}>
              <Trash2 size={16} />
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="settings-section">
        <h3>About</h3>
        <div className="glass-card" style={{ marginTop: 'var(--space-md)' }}>
          <div className="settings-row">
            <span className="settings-row-label">DSA Forge</span>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>v1.0.0</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">
              Gamified DSA Revision Platform
              <span>Browser-first, offline-capable study tool for coding interview prep</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

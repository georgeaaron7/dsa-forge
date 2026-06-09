import { useState, useEffect, useCallback } from 'react';
import { ChevronRight, BookOpen } from 'lucide-react';
import type { Topic, MasteryRecord, ViewName, StudyMode } from '../types';
import { getAllTopics, getMasteryByTopic } from '../lib/db';
import { calculateTopicMastery } from '../lib/spacedRepetition';

interface TopicExplorerProps {
  onNavigate: (view: ViewName, mode?: StudyMode, topicId?: string) => void;
}

interface TopicData {
  topic: Topic;
  mastery: number;
  masteryRecords: MasteryRecord[];
  newCount: number;
  learningCount: number;
  familiarCount: number;
  strongCount: number;
  readyCount: number;
  dueCount: number;
}

export default function TopicExplorer({ onNavigate }: TopicExplorerProps) {
  const [topics, setTopics] = useState<TopicData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTopics = useCallback(async () => {
    try {
      const allTopics = await getAllTopics();
      const now = Date.now();

      const topicData: TopicData[] = await Promise.all(
        allTopics.map(async (t) => {
          const records = await getMasteryByTopic(t.id);
          return {
            topic: t,
            mastery: calculateTopicMastery(records),
            masteryRecords: records,
            newCount: records.filter((m) => m.level === 'new').length,
            learningCount: records.filter((m) => m.level === 'learning').length,
            familiarCount: records.filter((m) => m.level === 'familiar').length,
            strongCount: records.filter((m) => m.level === 'strong').length,
            readyCount: records.filter((m) => m.level === 'interview_ready').length,
            dueCount: records.filter((m) => m.nextDueDate === null || m.nextDueDate <= now).length,
          };
        })
      );

      setTopics(topicData);
    } catch (err) {
      console.error('Failed to load topics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading topics...</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <h1 className="page-title">Topic Explorer</h1>
        <p className="page-subtitle">Browse and study problems by topic</p>
      </div>

      <div className="topic-grid">
        {topics.map((t, i) => (
          <div
            key={t.topic.id}
            className={`glass-card clickable topic-card animate-in-delay-${Math.min(i % 3 + 1, 3)}`}
            onClick={() => onNavigate('review', 'topic_run', t.topic.id)}
          >
            <div className="topic-card-header">
              <span className="topic-card-name">
                <BookOpen size={16} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--accent-primary)' }} />
                {t.topic.name}
              </span>
              <span className="topic-card-count">{t.topic.problemCount}</span>
            </div>

            <div className="progress-bar-wrapper" style={{ marginBottom: 'var(--space-md)' }}>
              <div
                className={`progress-bar-fill ${t.mastery >= 70 ? 'success' : t.mastery >= 40 ? '' : 'warning'}`}
                style={{ width: `${t.mastery}%` }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                {t.readyCount > 0 && (
                  <span className="mastery-badge interview_ready">{t.readyCount} ready</span>
                )}
                {t.strongCount > 0 && (
                  <span className="mastery-badge strong">{t.strongCount} strong</span>
                )}
                {t.newCount > 0 && (
                  <span className="mastery-badge new">{t.newCount} new</span>
                )}
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
            </div>

            {t.dueCount > 0 && (
              <div style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--fs-xs)', color: 'var(--color-warning)' }}>
                ⏰ {t.dueCount} due for review
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

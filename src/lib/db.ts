import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Problem, Topic, Review, MasteryRecord, SessionRecord, UserStats } from '../types';

// ─── Schema ──────────────────────────────────────────────────────

interface DSADBSchema extends DBSchema {
  problems: {
    key: string;
    value: Problem;
    indexes: { 'by-topic': string };
  };
  topics: {
    key: string;
    value: Topic;
    indexes: { 'by-order': number };
  };
  reviews: {
    key: string;
    value: Review;
    indexes: {
      'by-problem': string;
      'by-timestamp': number;
    };
  };
  mastery: {
    key: string;
    value: MasteryRecord;
    indexes: {
      'by-topic': string;
      'by-due': number;
      'by-level': string;
    };
  };
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: { 'by-start': number };
  };
  stats: {
    key: string;
    value: UserStats;
  };
}

const DB_NAME = 'dsa-revision-platform';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<DSADBSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<DSADBSchema>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<DSADBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Problems store
      const problemStore = db.createObjectStore('problems', { keyPath: 'id' });
      problemStore.createIndex('by-topic', 'topicId');

      // Topics store
      const topicStore = db.createObjectStore('topics', { keyPath: 'id' });
      topicStore.createIndex('by-order', 'displayOrder');

      // Reviews store
      const reviewStore = db.createObjectStore('reviews', { keyPath: 'id' });
      reviewStore.createIndex('by-problem', 'problemId');
      reviewStore.createIndex('by-timestamp', 'timestamp');

      // Mastery store
      const masteryStore = db.createObjectStore('mastery', { keyPath: 'problemId' });
      masteryStore.createIndex('by-topic', 'topicId');
      masteryStore.createIndex('by-due', 'nextDueDate');
      masteryStore.createIndex('by-level', 'level');

      // Sessions store
      const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
      sessionStore.createIndex('by-start', 'startedAt');

      // Stats store (single record)
      db.createObjectStore('stats', { keyPath: 'id' });
    },
  });

  return dbInstance;
}

// ─── Problems ────────────────────────────────────────────────────

export async function putProblems(problems: Problem[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('problems', 'readwrite');
  await Promise.all(problems.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function getAllProblems(): Promise<Problem[]> {
  const db = await getDB();
  return db.getAll('problems');
}

export async function getProblemsByTopic(topicId: string): Promise<Problem[]> {
  const db = await getDB();
  return db.getAllFromIndex('problems', 'by-topic', topicId);
}

export async function getProblem(id: string): Promise<Problem | undefined> {
  const db = await getDB();
  return db.get('problems', id);
}

// ─── Topics ──────────────────────────────────────────────────────

export async function putTopics(topics: Topic[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('topics', 'readwrite');
  await Promise.all(topics.map((t) => tx.store.put(t)));
  await tx.done;
}

export async function getAllTopics(): Promise<Topic[]> {
  const db = await getDB();
  return db.getAllFromIndex('topics', 'by-order');
}

// ─── Reviews ─────────────────────────────────────────────────────

export async function putReview(review: Review): Promise<void> {
  const db = await getDB();
  await db.put('reviews', review);
}

export async function getAllReviews(): Promise<Review[]> {
  const db = await getDB();
  return db.getAll('reviews');
}

export async function getReviewsByProblem(problemId: string): Promise<Review[]> {
  const db = await getDB();
  return db.getAllFromIndex('reviews', 'by-problem', problemId);
}

export async function getRecentReviews(limit: number): Promise<Review[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('reviews', 'by-timestamp');
  return all.slice(-limit).reverse();
}

// ─── Mastery ─────────────────────────────────────────────────────

export async function putMastery(record: MasteryRecord): Promise<void> {
  const db = await getDB();
  await db.put('mastery', record);
}

export async function putMasteryBulk(records: MasteryRecord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('mastery', 'readwrite');
  await Promise.all(records.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function getAllMastery(): Promise<MasteryRecord[]> {
  const db = await getDB();
  return db.getAll('mastery');
}

export async function getMastery(problemId: string): Promise<MasteryRecord | undefined> {
  const db = await getDB();
  return db.get('mastery', problemId);
}

export async function getMasteryByTopic(topicId: string): Promise<MasteryRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('mastery', 'by-topic', topicId);
}

export async function getDueProblems(): Promise<MasteryRecord[]> {
  const db = await getDB();
  const all = await db.getAll('mastery');
  const now = Date.now();
  
  // Get problems that are actually due for review
  const due = all.filter((m) => m.nextDueDate !== null && m.nextDueDate <= now);
  
  // Add a small batch of new problems (max 5) so the user always has something to do
  const newProblems = all.filter((m) => m.nextDueDate === null).slice(0, 5);
  
  return [...due, ...newProblems];
}

export async function getWeakProblems(): Promise<MasteryRecord[]> {
  const db = await getDB();
  const all = await db.getAll('mastery');
  return all.filter((m) => m.isWeak || m.level === 'new' || m.level === 'learning');
}

// ─── Sessions ────────────────────────────────────────────────────

export async function putSession(session: SessionRecord): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('sessions', 'by-start');
}

// ─── Stats ───────────────────────────────────────────────────────

const STATS_KEY = 'user-stats';

export async function getStats(): Promise<UserStats> {
  const db = await getDB();
  const stats = await db.get('stats', STATS_KEY);
  if (stats) return stats;

  const defaultStats: UserStats = {
    totalXP: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: '',
    totalReviews: 0,
    badges: [],
  };
  return defaultStats;
}

export async function putStats(stats: UserStats): Promise<void> {
  const db = await getDB();
  await db.put('stats', { ...stats, id: STATS_KEY } as UserStats & { id: string });
}

// ─── Utility ─────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx1 = db.transaction('problems', 'readwrite');
  await tx1.store.clear();
  await tx1.done;

  const tx2 = db.transaction('topics', 'readwrite');
  await tx2.store.clear();
  await tx2.done;

  const tx3 = db.transaction('reviews', 'readwrite');
  await tx3.store.clear();
  await tx3.done;

  const tx4 = db.transaction('mastery', 'readwrite');
  await tx4.store.clear();
  await tx4.done;

  const tx5 = db.transaction('sessions', 'readwrite');
  await tx5.store.clear();
  await tx5.done;

  const tx6 = db.transaction('stats', 'readwrite');
  await tx6.store.clear();
  await tx6.done;
}

export async function getDataCounts(): Promise<{ problems: number; topics: number; reviews: number }> {
  const db = await getDB();
  const problems = await db.count('problems');
  const topics = await db.count('topics');
  const reviews = await db.count('reviews');
  return { problems, topics, reviews };
}

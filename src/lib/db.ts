import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { supabase } from './supabaseClient'; // ⚡ Hooking up the Cloud
import type { Problem, Topic, Review, MasteryRecord, SessionRecord, UserStats } from '../types';

// ─── Local Catalog Schema (For fast offline loading of CSV data) ─

interface CatalogSchema extends DBSchema {
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
}

const DB_NAME = 'dsa-forge-catalog';
const DB_VERSION = 1;
let dbInstance: IDBPDatabase<CatalogSchema> | null = null;

export async function getDB(): Promise<IDBPDatabase<CatalogSchema>> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB<CatalogSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const problemStore = db.createObjectStore('problems', { keyPath: 'id' });
      problemStore.createIndex('by-topic', 'topicId');

      const topicStore = db.createObjectStore('topics', { keyPath: 'id' });
      topicStore.createIndex('by-order', 'displayOrder');
    },
  });
  return dbInstance;
}

// ─── Cloud Auth Helper ───────────────────────────────────────────

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('User not authenticated');
  return session.user.id;
}

// ─── Problems & Topics (Local IndexedDB) ─────────────────────────

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

// ─── Reviews (Supabase Cloud) ────────────────────────────────────

export async function putReview(review: Review): Promise<void> {
  const userId = await getUserId();
  await supabase.from('reviews').upsert({ user_id: userId, review_id: review.id, data: review });
}

export async function getAllReviews(): Promise<Review[]> {
  const userId = await getUserId();
  const { data } = await supabase.from('reviews').select('data').eq('user_id', userId);
  return (data || []).map((row) => row.data as Review);
}

export async function getReviewsByProblem(problemId: string): Promise<Review[]> {
  const all = await getAllReviews();
  return all.filter(r => r.problemId === problemId);
}

export async function getRecentReviews(limit: number): Promise<Review[]> {
  const all = await getAllReviews();
  return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

// ─── Mastery (Supabase Cloud) ────────────────────────────────────

export async function putMastery(record: MasteryRecord): Promise<void> {
  const userId = await getUserId();
  await supabase.from('problem_mastery').upsert({
    user_id: userId,
    problem_id: record.problemId,
    data: record
  });
}

export async function putMasteryBulk(records: MasteryRecord[]): Promise<void> {
  if (records.length === 0) return;
  const userId = await getUserId();
  const rows = records.map((r) => ({ user_id: userId, problem_id: r.problemId, data: r }));
  await supabase.from('problem_mastery').upsert(rows);
}

export async function getAllMastery(): Promise<MasteryRecord[]> {
  const userId = await getUserId();
  const { data } = await supabase.from('problem_mastery').select('data').eq('user_id', userId);
  return (data || []).map((row) => row.data as MasteryRecord);
}

export async function getMastery(problemId: string): Promise<MasteryRecord | undefined> {
  const userId = await getUserId();
  const { data } = await supabase.from('problem_mastery').select('data').eq('user_id', userId).eq('problem_id', problemId).maybeSingle();
  return data?.data as MasteryRecord | undefined;
}

export async function getMasteryByTopic(topicId: string): Promise<MasteryRecord[]> {
  const all = await getAllMastery();
  return all.filter((m) => m.topicId === topicId);
}

export async function getDueProblems(): Promise<MasteryRecord[]> {
  const all = await getAllMastery();
  const now = Date.now();
  const due = all.filter((m) => m.nextDueDate !== null && m.nextDueDate <= now);
  const newProblems = all.filter((m) => m.nextDueDate === null).slice(0, 5);
  return [...due, ...newProblems];
}

export async function getWeakProblems(): Promise<MasteryRecord[]> {
  const all = await getAllMastery();
  return all.filter((m) => m.isWeak || m.level === 'new' || m.level === 'learning');
}

// ─── Sessions (Supabase Cloud) ───────────────────────────────────

export async function putSession(session: SessionRecord): Promise<void> {
  const userId = await getUserId();
  await supabase.from('sessions').upsert({ user_id: userId, session_id: session.id, data: session });
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  const userId = await getUserId();
  const { data } = await supabase.from('sessions').select('data').eq('user_id', userId);
  const sessions = (data || []).map((row) => row.data as SessionRecord);
  return sessions.sort((a, b) => a.startedAt - b.startedAt);
}

// ─── Stats (Supabase Cloud) ──────────────────────────────────────

const defaultStats: UserStats = {
  totalXP: 0,
  level: 1,
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  totalReviews: 0,
  badges: [],
};

export async function getStats(): Promise<UserStats> {
  try {
    const userId = await getUserId();
    const { data } = await supabase.from('user_stats').select('data').eq('user_id', userId).maybeSingle();
    if (data?.data) return data.data as UserStats;
  } catch (err) {
    // If not found or auth fails during initialization, return defaults
  }
  return defaultStats;
}

export async function putStats(stats: UserStats): Promise<void> {
  try {
    const userId = await getUserId();
    await supabase.from('user_stats').upsert({ user_id: userId, data: stats });
  } catch (err) {
    console.error('Could not sync stats to cloud', err);
  }
}

// ─── Utility ─────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx1 = db.transaction('problems', 'readwrite');
  await tx1.store.clear();
  const tx2 = db.transaction('topics', 'readwrite');
  await tx2.store.clear();

  try {
    const userId = await getUserId();
    await supabase.from('user_stats').delete().eq('user_id', userId);
    await supabase.from('problem_mastery').delete().eq('user_id', userId);
    await supabase.from('reviews').delete().eq('user_id', userId);
    await supabase.from('sessions').delete().eq('user_id', userId);
  } catch (err) {
    console.log('Skipped cloud deletion (user may not be logged in)');
  }
}

export async function getDataCounts(): Promise<{ problems: number; topics: number; reviews: number }> {
  const db = await getDB();
  const problems = await db.count('problems');
  const topics = await db.count('topics');

  let reviews = 0;
  try {
    const userId = await getUserId();
    const { count } = await supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    reviews = count || 0;
  } catch (err) {
    // Ignore
  }

  return { problems, topics, reviews };
}
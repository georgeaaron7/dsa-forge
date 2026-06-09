import Papa from 'papaparse';
import type { Problem, Topic, MasteryRecord } from '../types';
import { putProblems, putTopics, putMasteryBulk, getAllProblems } from './db';

// ─── CSV File Manifest ───────────────────────────────────────────

const CSV_FILES = [
  'Array.csv',
  'BST.csv',
  'BackTracking.csv',
  'Binary Trees.csv',
  'Bit Manipulation.csv',
  'DP.csv',
  'Graph.csv',
  'Greedy.csv',
  'Heap.csv',
  'LL.csv',
  'Matrix.csv',
  'Search_Sort.csv',
  'Stacks_Queues.csv',
  'String.csv',
  'Trie.csv',
];

// ─── Topic ID Utility ────────────────────────────────────────────

function toTopicId(filename: string): string {
  return filename
    .replace('.csv', '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toTopicName(filename: string): string {
  const base = filename.replace('.csv', '');
  if (base === 'Search_Sort') return 'Search & Sort';
  if (base === 'Stacks_Queues') return 'Stacks & Queues';
  return base;
}

// ─── Problem ID Utility ──────────────────────────────────────────

function toProblemId(topicId: string, index: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  return `${topicId}--${index}--${slug}`;
}

// ─── Parse Solution Text ─────────────────────────────────────────

function parseSolution(raw: string): {
  summary: string;
  approach: string;
  pseudoCode: string;
  complexity: string;
  notes: string;
} {
  const result = {
    summary: '',
    approach: '',
    pseudoCode: '',
    complexity: '',
    notes: '',
  };

  if (!raw) return result;

  // Try to parse numbered sections
  const sections = raw.split(/\n(?=\d+\.\s)/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (/^1\.\s*(Problem\s*Summary|Summary)/i.test(trimmed)) {
      result.summary = trimmed.replace(/^1\.\s*(Problem\s*Summary|Summary)\s*:?\s*/i, '').trim();
    } else if (/^2\.\s*(Approach)/i.test(trimmed)) {
      result.approach = trimmed.replace(/^2\.\s*Approach\s*:?\s*/i, '').trim();
    } else if (/^3\.\s*(Pseudo-?code|Code)/i.test(trimmed)) {
      result.pseudoCode = trimmed.replace(/^3\.\s*(Pseudo-?code|Code)\s*:?\s*/i, '').trim();
    } else if (/^4\.\s*(Time|Complexity)/i.test(trimmed)) {
      result.complexity = trimmed.replace(/^4\.\s*(Time Complexity and Space Complexity|Complexity)\s*:?\s*/i, '').trim();
    } else if (/^5\./i.test(trimmed)) {
      result.notes = trimmed.replace(/^5\.\s*\w+\s*:?\s*/i, '').trim();
    }
  }

  // Fallback: if nothing was parsed, put everything in notes
  if (!result.summary && !result.approach && !result.pseudoCode) {
    result.notes = raw;
  }

  return result;
}

// ─── Fetch & Parse a Single CSV ──────────────────────────────────

async function fetchCSV(filename: string): Promise<string> {
  const url = `${import.meta.env.BASE_URL}questions/${encodeURIComponent(filename)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}: ${response.status}`);
  }
  return response.text();
}

interface CSVRow {
  TOPIC: string;
  'PROBLEM LINK'?: string;
  'PROBLEM NAME'?: string;
  URL?: string;
  SOLUTION: string;
}

function parseCSVContent(csv: string): CSVRow[] {
  const result = Papa.parse<CSVRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}

// ─── Main Ingestion Function ─────────────────────────────────────

export async function ingestAllCSVs(): Promise<{ problems: number; topics: number }> {
  // Check if already ingested
  const existing = await getAllProblems();
  if (existing.length > 0) {
    return { problems: existing.length, topics: CSV_FILES.length };
  }

  const allProblems: Problem[] = [];
  const allTopics: Topic[] = [];

  for (let i = 0; i < CSV_FILES.length; i++) {
    const filename = CSV_FILES[i];
    const topicId = toTopicId(filename);
    const topicName = toTopicName(filename);

    try {
      const csv = await fetchCSV(filename);
      const rows = parseCSVContent(csv);

      const topic: Topic = {
        id: topicId,
        name: topicName,
        displayOrder: i,
        problemCount: rows.length,
      };
      allTopics.push(topic);

      rows.forEach((row, idx) => {
        const title = (row['PROBLEM NAME'] || row['PROBLEM LINK'] || '').trim();
        if (!title) return;

        const parsed = parseSolution(row.SOLUTION || '');

        const problem: Problem = {
          id: toProblemId(topicId, idx, title),
          topicId,
          topic: topicName,
          title,
          link: (row.URL || '').trim(),
          solution: (row.SOLUTION || '').trim(),
          summary: parsed.summary,
          approach: parsed.approach,
          pseudoCode: parsed.pseudoCode,
          complexity: parsed.complexity,
          notes: parsed.notes,
        };

        allProblems.push(problem);
      });
    } catch (err) {
      console.warn(`Failed to ingest ${filename}:`, err);
    }
  }

  // Persist to IndexedDB
  await putTopics(allTopics);
  await putProblems(allProblems);

  // Create initial mastery records
  const masteryRecords: MasteryRecord[] = allProblems.map((p) => ({
    problemId: p.id,
    topicId: p.topicId,
    level: 'new' as const,
    reviewCount: 0,
    lastReviewedAt: null,
    nextDueDate: null,
    consecutiveCorrect: 0,
    ease: 1.0,
    stability: 0,
    isWeak: false,
    isBookmarked: false,
  }));

  await putMasteryBulk(masteryRecords);

  return { problems: allProblems.length, topics: allTopics.length };
}

// ─── Re-Ingest (Force Reload) ────────────────────────────────────

export async function forceReIngest(): Promise<{ problems: number; topics: number }> {
  // Clear problems and topics, keep mastery and reviews
  const { clearAllData } = await import('./db');
  await clearAllData();
  return ingestAllCSVs();
}

/**
 * Learning statistics — lightweight event store for study activity.
 *
 * Tracks which study features are used and how often, so the UI can show
 * reading stats (words looked up, sentences simplified, etc.) without
 * needing a server round-trip.
 *
 * Design notes:
 *   - Events are stored in IndexedDB under a separate `readest-enhanced-stats`
 *     database, not mixed with the audit log or vocab store.
 *   - Only aggregated counts are exposed through the query API; raw events
 *     stay in the store for replaying in tests.
 *   - Events are pruned after RETAIN_MS to bound storage growth.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { StudyRequestType } from './ai-provider';

const DB_NAME = 'readest-enhanced-stats';
const DB_VERSION = 1;
const STORE = 'study-events';
const RETAIN_MS = 90 * 24 * 60 * 60 * 1_000; // 90 days

export interface StudyEvent {
  id?: number; // auto-increment key
  type: StudyRequestType;
  provider: 'gateway' | 'local';
  truncated: boolean;
  timestamp: number;
}

export interface StudySummary {
  totalRequests: number;
  byType: Record<StudyRequestType, number>;
  gatewayRequests: number;
  localFallbacks: number;
}

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-timestamp', 'timestamp');
        store.createIndex('by-type', 'type');
      }
    },
  });
  return _db;
}

export async function recordStudyEvent(event: Omit<StudyEvent, 'id'>): Promise<void> {
  const db = await getDb();
  await db.add(STORE, event);
}

export async function getStudySummary(since?: number): Promise<StudySummary> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const index = tx.store.index('by-timestamp');
  const range = since !== undefined ? IDBKeyRange.lowerBound(since) : undefined;

  const summary: StudySummary = {
    totalRequests: 0,
    byType: {
      explain_slang: 0,
      simplify_sentence: 0,
      summarize: 0,
      ask_question: 0,
    },
    gatewayRequests: 0,
    localFallbacks: 0,
  };

  let cursor = await index.openCursor(range);
  while (cursor) {
    const event = cursor.value as StudyEvent;
    summary.totalRequests++;
    summary.byType[event.type] = (summary.byType[event.type] ?? 0) + 1;
    if (event.provider === 'gateway') summary.gatewayRequests++;
    else summary.localFallbacks++;
    cursor = await cursor.continue();
  }

  return summary;
}

export async function pruneOldEvents(): Promise<void> {
  const cutoff = Date.now() - RETAIN_MS;
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const index = tx.store.index('by-timestamp');
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

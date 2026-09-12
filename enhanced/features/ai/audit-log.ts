/**
 * Audit log for AI study requests.
 *
 * Stores metadata only — never the content of the request or response.
 * This satisfies two requirements from the agent-ai-study plan:
 *   - Quota tracking: count requests per session / day.
 *   - Audit trail: replay fixed events for statistics tests.
 *
 * Storage is IndexedDB via the `idb` library, isolated under the
 * `readest-enhanced-audit` database so it doesn't collide with
 * the vocab store in local-storage.ts.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { AuditEntry } from './ai-provider';

const DB_NAME = 'readest-enhanced-audit';
const DB_VERSION = 1;
const STORE = 'study-requests';

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'requestId' });
        store.createIndex('by-start', 'startedAt');
        store.createIndex('by-type', 'type');
      }
    },
  });
  return _db;
}

export async function writeAuditEntry(entry: AuditEntry): Promise<void> {
  const db = await getDb();
  await db.put(STORE, entry);
}

export async function getAuditEntries(since?: number, limit = 100): Promise<AuditEntry[]> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const index = tx.store.index('by-start');
  const range = since !== undefined ? IDBKeyRange.lowerBound(since) : undefined;
  const entries: AuditEntry[] = [];
  let cursor = await index.openCursor(range, 'next');
  while (cursor && entries.length < limit) {
    entries.push(cursor.value as AuditEntry);
    cursor = await cursor.continue();
  }
  return entries;
}

/**
 * Count requests by type since a given timestamp.
 * Used by the quota guard in StudyController.
 */
export async function countRequests(since: number): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readonly');
  const index = tx.store.index('by-start');
  return index.count(IDBKeyRange.lowerBound(since));
}

/** Clear entries older than retainMs to bound storage growth. */
export async function pruneOldEntries(retainMs = 30 * 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - retainMs;
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const index = tx.store.index('by-start');
  let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
}

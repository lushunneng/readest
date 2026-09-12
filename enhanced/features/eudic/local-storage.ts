/**
 * Local IndexedDB storage for vocabulary items
 *
 * Schema design per v5-report.md section 6.1
 * Supports sync status tracking and offline queue management
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { VocabularyItem } from '../../core/models';

/**
 * Local vocabulary item with sync metadata
 */
export interface LocalVocabularyItem {
  id: string; // UUID v4
  word: string; // Normalized: lowercase, trimmed
  originalWord: string; // Original case preserved
  definition?: string; // Optional definition
  context?: string; // Original sentence
  sourceLocation?: {
    bookHash: string;
    bookTitle: string;
    cfi: string;
  };
  addedAt: number; // Unix timestamp (ms)
  syncStatus: 'pending' | 'synced' | 'failed' | 'unknown';
  syncedAt?: number; // Last successful sync time
  syncError?: string; // Sync failure reason
  retryCount: number; // Number of retry attempts
}

interface VocabularyDB extends DBSchema {
  words: {
    key: string;
    value: LocalVocabularyItem;
    indexes: {
      'by-word': string;
      'by-added-at': number;
      'by-sync-status': 'pending' | 'synced' | 'failed' | 'unknown';
    };
  };
}

const DB_NAME = 'readest-vocabulary';
const DB_VERSION = 1;
const STORE_NAME = 'words';

/**
 * Local storage manager for vocabulary items
 */
export class VocabularyStorage {
  private db: IDBPDatabase<VocabularyDB> | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        this.db = await openDB<VocabularyDB>(DB_NAME, DB_VERSION, {
          upgrade(db) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('by-word', 'word', { unique: true });
            store.createIndex('by-added-at', 'addedAt');
            store.createIndex('by-sync-status', 'syncStatus');
          },
        });
      } catch (error) {
        console.error('Failed to initialize IndexedDB:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Add a vocabulary item to local storage
   */
  async addItem(item: LocalVocabularyItem): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.put(STORE_NAME, item);
  }

  /**
   * Get a vocabulary item by word (normalized)
   */
  async getByWord(word: string): Promise<LocalVocabularyItem | undefined> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const normalized = word.toLowerCase().trim();
    return this.db.getFromIndex(STORE_NAME, 'by-word', normalized);
  }

  /**
   * Get all vocabulary items, sorted by added_at descending
   */
  async getAll(): Promise<LocalVocabularyItem[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const items = await this.db.getAll(STORE_NAME);
    return items.sort((a, b) => b.addedAt - a.addedAt);
  }

  /**
   * Get all items with a specific sync status
   */
  async getByStatus(status: LocalVocabularyItem['syncStatus']): Promise<LocalVocabularyItem[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return this.db.getAllFromIndex(STORE_NAME, 'by-sync-status', status);
  }

  /**
   * Update sync status for an item
   */
  async updateSyncStatus(
    id: string,
    status: LocalVocabularyItem['syncStatus'],
    syncedAt?: number,
    syncError?: string,
    retryCount?: number,
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const item = await this.db.get(STORE_NAME, id);
    if (!item) return;

    item.syncStatus = status;
    if (syncedAt !== undefined) item.syncedAt = syncedAt;
    if (syncError !== undefined) item.syncError = syncError;
    if (retryCount !== undefined) item.retryCount = retryCount;

    await this.db.put(STORE_NAME, item);
  }

  /**
   * Delete a vocabulary item by word
   */
  async deleteByWord(word: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const normalized = word.toLowerCase().trim();
    const item = await this.db.getFromIndex(STORE_NAME, 'by-word', normalized);
    if (item) {
      await this.db.delete(STORE_NAME, item.id);
    }
  }

  /**
   * Check if a word exists in storage
   */
  async hasWord(word: string): Promise<boolean> {
    const item = await this.getByWord(word);
    return item !== undefined;
  }

  /**
   * Clear all vocabulary items (for testing/migration)
   */
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    await this.db.clear(STORE_NAME);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db?.close();
    this.db = null;
    this.initPromise = null;
  }
}

/**
 * Generate UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID();
}

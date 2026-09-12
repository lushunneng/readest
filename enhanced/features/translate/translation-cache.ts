/**
 * Translation Cache - IndexedDB-based caching for translations
 *
 * Cache Key Format: ${textHash}_${sourceLang}_${targetLang}_${provider}_${modelVersion}_${promptVersion}
 *
 * Cache invalidation triggers:
 * - Content version change (book re-import)
 * - CFI change (position drift)
 * - Provider/model version change
 * - Prompt version change
 */

import { createHash } from 'crypto';

export interface TranslationCacheEntry {
  /** Cache key */
  key: string;

  /** Original text */
  originalText: string;

  /** Text hash (SHA-256) */
  textHash: string;

  /** Source language code (ISO 639-1) */
  sourceLang: string;

  /** Target language code (ISO 639-1) */
  targetLang: string;

  /** Translation provider (deepl, openai, local) */
  provider: string;

  /** Model version (gpt-4, deepl-pro, custom-v1) */
  modelVersion: string;

  /** Prompt version (v1, v2, ...) */
  promptVersion: string;

  /** Translated text */
  translatedText: string;

  /** Content version from ArticleDocument */
  contentVersion: string;

  /** CFI locator where translation was performed */
  cfi: string;

  /** Book hash */
  bookHash: string;

  /** Timestamp when cached */
  cachedAt: number;

  /** Timestamp when last accessed */
  lastAccessedAt: number;
}

export interface CacheKey {
  textHash: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  modelVersion: string;
  promptVersion: string;
}

const DB_NAME = 'readest-translation-cache';
const DB_VERSION = 1;
const STORE_NAME = 'translations';

export class TranslationCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open translation cache database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });

          // Index by book hash for bulk invalidation
          store.createIndex('bookHash', 'bookHash', { unique: false });

          // Index by cached time for LRU eviction
          store.createIndex('cachedAt', 'cachedAt', { unique: false });

          // Index by last accessed time for LRU management
          store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Generate cache key from parameters
   */
  static generateCacheKey(params: CacheKey): string {
    const { textHash, sourceLang, targetLang, provider, modelVersion, promptVersion } = params;
    return `${textHash}_${sourceLang}_${targetLang}_${provider}_${modelVersion}_${promptVersion}`;
  }

  /**
   * Hash text using SHA-256
   */
  static hashText(text: string): string {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      // Browser environment with Web Crypto API
      // For synchronous operation, we'll use a simpler hash
      // In production, consider using async crypto.subtle.digest
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString(16);
    } else {
      // Node.js environment
      return createHash('sha256').update(text).digest('hex');
    }
  }

  /**
   * Get cached translation
   */
  async get(key: string): Promise<TranslationCacheEntry | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as TranslationCacheEntry | undefined;

        if (entry) {
          // Update last accessed time
          entry.lastAccessedAt = Date.now();
          store.put(entry);
          resolve(entry);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to get cache entry'));
      };
    });
  }

  /**
   * Set cached translation
   */
  async set(entry: TranslationCacheEntry): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to set cache entry'));
      };
    });
  }

  /**
   * Invalidate cache entries for a book (e.g., after re-import)
   */
  async invalidateBook(bookHash: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('bookHash');
      const request = index.openCursor(IDBKeyRange.only(bookHash));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to invalidate book cache'));
      };
    });
  }

  /**
   * Clear old cache entries (LRU eviction)
   * @param maxAge Maximum age in milliseconds (default: 30 days)
   */
  async clearOldEntries(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const cutoffTime = Date.now() - maxAge;
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('lastAccessedAt');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to clear old entries'));
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  }> {
    await this.init();

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        const totalEntries = countRequest.result;

        if (totalEntries === 0) {
          resolve({ totalEntries: 0, oldestEntry: null, newestEntry: null });
          return;
        }

        const index = store.index('cachedAt');
        const oldestRequest = index.openCursor(null, 'next');
        const newestRequest = index.openCursor(null, 'prev');

        let oldestEntry: number | null = null;
        let newestEntry: number | null = null;
        let completed = 0;

        const checkComplete = () => {
          completed++;
          if (completed === 2) {
            resolve({ totalEntries, oldestEntry, newestEntry });
          }
        };

        oldestRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            oldestEntry = (cursor.value as TranslationCacheEntry).cachedAt;
          }
          checkComplete();
        };

        newestRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            newestEntry = (cursor.value as TranslationCacheEntry).cachedAt;
          }
          checkComplete();
        };
      };

      countRequest.onerror = () => {
        reject(new Error('Failed to get cache stats'));
      };
    });
  }
}

// Singleton instance
let cacheInstance: TranslationCache | null = null;

export function getTranslationCache(): TranslationCache {
  if (!cacheInstance) {
    cacheInstance = new TranslationCache();
  }
  return cacheInstance;
}

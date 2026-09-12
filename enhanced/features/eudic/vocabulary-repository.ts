/**
 * LearningRepository implementation for Eudic integration
 *
 * Implements enhanced/core/ports.ts LearningRepository interface
 * Strategy per v5-report.md:
 * - Write-before-query for deduplication
 * - Local cache to reduce API calls
 * - Offline-first with sync queue
 */

import type { LearningRepository } from '../../core/ports';
import type { VocabularyItem } from '../../core/models';
import { createPortError } from '../../core/ports';
import { VocabularyStorage, generateId, type LocalVocabularyItem } from './local-storage';
import { EudicApiClient } from './eudic-api-client';
import { VocabularySyncQueue } from './sync-queue';

/**
 * Eudic vocabulary repository with local-first architecture
 */
export class EudicVocabularyRepository implements LearningRepository {
  private storage: VocabularyStorage;
  private apiClient: EudicApiClient;
  private syncQueue: VocabularySyncQueue;
  private addedWordsCache = new Set<string>(); // Local cache per v5-report.md 2.2

  constructor(token?: string) {
    this.storage = new VocabularyStorage();
    this.apiClient = new EudicApiClient(token);
    this.syncQueue = new VocabularySyncQueue(this.storage, this.apiClient);
  }

  /**
   * Initialize repository (must be called before use)
   */
  async init(): Promise<void> {
    await this.storage.init();

    // Populate cache from storage
    const items = await this.storage.getAll();
    items.forEach((item) => {
      this.addedWordsCache.add(item.word);
    });

    // Start sync queue
    this.syncQueue.start();
  }

  /**
   * Add a word to vocabulary list
   *
   * Strategy per v5-report.md section 2.2:
   * 1. Check local cache first (fast path)
   * 2. Add to local storage immediately (offline-first)
   * 3. Queue for background sync
   */
  async addVocabulary(item: VocabularyItem): Promise<void> {
    const normalizedWord = item.word.toLowerCase().trim();

    // Check cache first (fast path)
    if (this.addedWordsCache.has(normalizedWord)) {
      console.log(`Word "${item.word}" already in local cache, skipping`);
      return;
    }

    // Check storage
    const existing = await this.storage.getByWord(normalizedWord);
    if (existing) {
      console.log(`Word "${item.word}" already in storage, skipping`);
      this.addedWordsCache.add(normalizedWord);
      return;
    }

    // Create local item
    const localItem: LocalVocabularyItem = {
      id: generateId(),
      word: normalizedWord,
      originalWord: item.word,
      definition: undefined, // Will be fetched from dictionary if needed
      context: item.context,
      sourceLocation:
        item.source_book && item.source_cfi
          ? {
              bookHash: item.source_book,
              bookTitle: item.source_book, // TODO: Resolve actual title
              cfi: item.source_cfi,
            }
          : undefined,
      addedAt: item.added_at,
      syncStatus: this.apiClient.isConfigured() ? 'pending' : 'unknown',
      retryCount: 0,
    };

    try {
      // Add to local storage first (offline-first)
      await this.storage.addItem(localItem);
      this.addedWordsCache.add(normalizedWord);

      // Trigger immediate sync if online
      if (this.apiClient.isConfigured() && !this.apiClient.isDegraded()) {
        this.syncQueue.syncNow().catch((err) => {
          console.error('Immediate sync failed:', err);
          // Don't throw - item is safely in local storage
        });
      }
    } catch (error) {
      console.error('Failed to add vocabulary item:', error);
      throw createPortError('EUDIC_API_ERROR', 'Failed to save vocabulary item', error);
    }
  }

  /**
   * Remove a word from vocabulary list
   *
   * Note: Per v5-report.md section 5, remote deletion is not implemented in Phase 0
   * This only removes from local storage
   */
  async removeVocabulary(word: string): Promise<void> {
    const normalizedWord = word.toLowerCase().trim();

    try {
      await this.storage.deleteByWord(normalizedWord);
      this.addedWordsCache.delete(normalizedWord);
      console.log(`Word "${word}" removed from local storage (not synced to Eudic)`);
    } catch (error) {
      console.error('Failed to remove vocabulary item:', error);
      throw createPortError('EUDIC_API_ERROR', 'Failed to remove vocabulary item', error);
    }
  }

  /**
   * Get all vocabulary items
   * Returns local items sorted by added_at descending
   */
  async getVocabularyList(): Promise<VocabularyItem[]> {
    try {
      const localItems = await this.storage.getAll();

      return localItems.map((item) => this.toVocabularyItem(item));
    } catch (error) {
      console.error('Failed to get vocabulary list:', error);
      throw createPortError('EUDIC_API_ERROR', 'Failed to retrieve vocabulary list', error);
    }
  }

  /**
   * Check if a word is in vocabulary list
   */
  async hasVocabulary(word: string): Promise<boolean> {
    const normalizedWord = word.toLowerCase().trim();

    // Check cache first
    if (this.addedWordsCache.has(normalizedWord)) {
      return true;
    }

    // Check storage
    const exists = await this.storage.hasWord(normalizedWord);
    if (exists) {
      this.addedWordsCache.add(normalizedWord);
    }

    return exists;
  }

  /**
   * Get sync statistics (extension to LearningRepository)
   */
  async getSyncStats(): Promise<{
    pending: number;
    synced: number;
    failed: number;
    unknown: number;
  }> {
    return this.syncQueue.getStats();
  }

  /**
   * Force sync now (extension to LearningRepository)
   */
  async syncNow(): Promise<void> {
    await this.syncQueue.syncNow();
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.syncQueue.stop();
    this.storage.close();
  }

  /**
   * Convert local item to VocabularyItem
   */
  private toVocabularyItem(item: LocalVocabularyItem): VocabularyItem {
    return {
      word: item.originalWord,
      context: item.context,
      source_cfi: item.sourceLocation?.cfi,
      source_book: item.sourceLocation?.bookHash,
      added_at: item.addedAt,
    };
  }
}

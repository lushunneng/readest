/**
 * Vocabulary sync queue with offline recovery
 *
 * Features per v5-report.md section 6.3:
 * - Automatic sync on network recovery
 * - Periodic sync every 5 minutes
 * - Retry with exponential backoff
 * - Persistence across restarts
 */

import type { LocalVocabularyItem, VocabularyStorage } from './local-storage';
import type { EudicApiClient } from './eudic-api-client';

export interface SyncQueueOptions {
  syncIntervalMs?: number; // Default: 5 minutes
  onSyncComplete?: (successCount: number, failureCount: number) => void;
  onSyncError?: (error: Error) => void;
}

/**
 * Background sync queue for vocabulary items
 */
export class VocabularySyncQueue {
  private storage: VocabularyStorage;
  private apiClient: EudicApiClient;
  private syncIntervalMs: number;
  private intervalId: number | null = null;
  private isSyncing = false;
  private onSyncComplete?: (successCount: number, failureCount: number) => void;
  private onSyncError?: (error: Error) => void;

  constructor(
    storage: VocabularyStorage,
    apiClient: EudicApiClient,
    options: SyncQueueOptions = {},
  ) {
    this.storage = storage;
    this.apiClient = apiClient;
    this.syncIntervalMs = options.syncIntervalMs || 5 * 60 * 1000; // 5 minutes
    this.onSyncComplete = options.onSyncComplete;
    this.onSyncError = options.onSyncError;
  }

  /**
   * Start automatic sync (periodic + online event)
   */
  start(): void {
    if (this.intervalId !== null) {
      return; // Already started
    }

    // Sync on network recovery
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }

    // Periodic sync
    this.intervalId = window.setInterval(() => {
      this.syncPendingItems().catch((err) => {
        console.error('Periodic sync failed:', err);
      });
    }, this.syncIntervalMs);

    // Initial sync
    this.syncPendingItems().catch((err) => {
      console.error('Initial sync failed:', err);
    });
  }

  /**
   * Stop automatic sync
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
  }

  /**
   * Handle network recovery event
   */
  private handleOnline = (): void => {
    console.log('Network recovered, syncing pending items...');
    this.syncPendingItems().catch((err) => {
      console.error('Online sync failed:', err);
    });
  };

  /**
   * Sync all pending and failed items
   *
   * State machine transitions:
   * - pending -> synced (success)
   * - pending -> failed (error, retryCount < 3)
   * - failed -> synced (retry success)
   * - failed -> failed (retry error, retryCount < 3)
   */
  async syncPendingItems(): Promise<void> {
    if (this.isSyncing) {
      return; // Already syncing
    }

    if (!this.apiClient.isConfigured()) {
      console.log('Eudic API not configured, skipping sync');
      return;
    }

    if (this.apiClient.isDegraded()) {
      console.log('Eudic API in degraded mode, skipping sync');
      return;
    }

    this.isSyncing = true;
    let successCount = 0;
    let failureCount = 0;

    try {
      // Get items that need syncing
      const pendingItems = await this.storage.getByStatus('pending');
      const failedItems = await this.storage.getByStatus('failed');
      const itemsToSync = [...pendingItems, ...failedItems.filter((item) => item.retryCount < 3)];

      if (itemsToSync.length === 0) {
        return;
      }

      console.log(`Syncing ${itemsToSync.length} vocabulary items...`);

      for (const item of itemsToSync) {
        try {
          await this.syncItem(item);
          successCount++;
        } catch (error) {
          console.error(`Failed to sync "${item.word}":`, error);
          failureCount++;
        }
      }

      console.log(`Sync complete: ${successCount} succeeded, ${failureCount} failed`);

      if (this.onSyncComplete) {
        this.onSyncComplete(successCount, failureCount);
      }
    } catch (error) {
      console.error('Sync queue error:', error);
      if (this.onSyncError) {
        this.onSyncError(error as Error);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a single item
   */
  private async syncItem(item: LocalVocabularyItem): Promise<void> {
    try {
      // Attempt to add to Eudic
      await this.apiClient.addWords([
        {
          word: item.originalWord,
          definition: item.definition,
          example: item.context,
        },
      ]);

      // Success - update status
      await this.storage.updateSyncStatus(item.id, 'synced', Date.now(), undefined, 0);
    } catch (error) {
      const retryCount = (item.retryCount || 0) + 1;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (retryCount >= 3) {
        // Max retries reached - mark as failed permanently
        await this.storage.updateSyncStatus(
          item.id,
          'failed',
          undefined,
          `Max retries reached: ${errorMessage}`,
          retryCount,
        );
      } else {
        // Will retry later
        await this.storage.updateSyncStatus(item.id, 'failed', undefined, errorMessage, retryCount);
      }

      throw error;
    }
  }

  /**
   * Force sync now (user-triggered)
   */
  async syncNow(): Promise<void> {
    await this.syncPendingItems();
  }

  /**
   * Get sync statistics
   */
  async getStats(): Promise<{
    pending: number;
    synced: number;
    failed: number;
    unknown: number;
  }> {
    const [pending, synced, failed, unknown] = await Promise.all([
      this.storage.getByStatus('pending'),
      this.storage.getByStatus('synced'),
      this.storage.getByStatus('failed'),
      this.storage.getByStatus('unknown'),
    ]);

    return {
      pending: pending.length,
      synced: synced.length,
      failed: failed.length,
      unknown: unknown.length,
    };
  }
}

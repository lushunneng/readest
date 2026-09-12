/**
 * Translation Controller - Orchestrates translation requests with caching and concurrency control
 */

import type { ReaderPort } from '../../core/ports';
import type { TextSelection } from '../../core/models';
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
} from './translation-provider';
import {
  getTranslationCache,
  TranslationCache,
  type TranslationCacheEntry,
} from './translation-cache';

export interface TranslationControllerConfig {
  /** Translation provider */
  provider: TranslationProvider;

  /** Target language for translations */
  targetLang: string;

  /** Default source language (auto-detect if not specified) */
  defaultSourceLang?: string;

  /** Maximum concurrent translation requests */
  maxConcurrency?: number;

  /** Daily request limit (cost control) */
  dailyRequestLimit?: number;

  /** Prompt version for cache keying */
  promptVersion?: string;
}

export interface TranslationResult {
  /** Original text */
  originalText: string;

  /** Translated text */
  translatedText: string;

  /** Source language */
  sourceLang: string;

  /** Target language */
  targetLang: string;

  /** Whether result came from cache */
  fromCache: boolean;

  /** CFI location */
  cfi: string;

  /** Book hash */
  bookHash: string;

  /** Provider metadata */
  metadata?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (result: TranslationResult) => void;
  reject: (error: Error) => void;
  abortController: AbortController;
}

export class TranslationController {
  private cache: TranslationCache;
  private config: TranslationControllerConfig;
  private pendingRequests = new Map<string, PendingRequest>();
  private activeRequests = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private dailyRequestCount = 0;
  private lastResetDate: string;

  constructor(
    private readerPort: ReaderPort,
    config: TranslationControllerConfig,
  ) {
    this.config = {
      maxConcurrency: 3,
      dailyRequestLimit: 1000,
      promptVersion: 'v1',
      defaultSourceLang: 'auto',
      ...config,
    };
    this.cache = getTranslationCache();
    this.lastResetDate = new Date().toISOString().split('T')[0];
  }

  /**
   * Translate selected text in the reader
   */
  async translateSelection(bookHash: string): Promise<TranslationResult | null> {
    const selection = await this.readerPort.getTextSelection(bookHash);

    if (!selection) {
      return null;
    }

    return this.translate({
      text: selection.text,
      cfi: selection.cfi,
      bookHash,
      contentVersion: `${bookHash}_${selection.index}`,
    });
  }

  /**
   * Translate arbitrary text with CFI context
   */
  async translate(params: {
    text: string;
    cfi: string;
    bookHash: string;
    contentVersion: string;
    sourceLang?: string;
  }): Promise<TranslationResult> {
    const { text, cfi, bookHash, contentVersion, sourceLang } = params;

    // Check daily limit
    this.resetDailyCountIfNeeded();
    if (this.dailyRequestCount >= (this.config.dailyRequestLimit || 1000)) {
      throw new Error('Daily translation request limit reached');
    }

    // Generate cache key
    const textHash = TranslationCache.hashText(text);
    const providerConfig = this.config.provider.getConfig();
    const cacheKey = TranslationCache.generateCacheKey({
      textHash,
      sourceLang: sourceLang || this.config.defaultSourceLang || 'auto',
      targetLang: this.config.targetLang,
      provider: providerConfig.provider,
      modelVersion: providerConfig.modelVersion,
      promptVersion: this.config.promptVersion || 'v1',
    });

    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached && cached.contentVersion === contentVersion) {
      return {
        originalText: text,
        translatedText: cached.translatedText,
        sourceLang: cached.sourceLang,
        targetLang: cached.targetLang,
        fromCache: true,
        cfi,
        bookHash,
        metadata: {
          cachedAt: cached.cachedAt,
          lastAccessedAt: cached.lastAccessedAt,
        },
      };
    }

    // Check if already in flight
    if (this.pendingRequests.has(cacheKey)) {
      const pending = this.pendingRequests.get(cacheKey)!;
      return new Promise((resolve, reject) => {
        const originalResolve = pending.resolve;
        const originalReject = pending.reject;

        pending.resolve = (result) => {
          originalResolve(result);
          resolve(result);
        };

        pending.reject = (error) => {
          originalReject(error);
          reject(error);
        };
      });
    }

    // Create new request
    const abortController = new AbortController();

    const promise = new Promise<TranslationResult>((resolve, reject) => {
      this.pendingRequests.set(cacheKey, { resolve, reject, abortController });

      const executeRequest = async () => {
        try {
          this.activeRequests++;

          const request: TranslationRequest = {
            text,
            sourceLang: sourceLang || this.config.defaultSourceLang || 'auto',
            targetLang: this.config.targetLang,
            signal: abortController.signal,
          };

          const response = await this.config.provider.translate(request);

          // Increment daily count
          this.dailyRequestCount++;

          // Cache the result
          const cacheEntry: TranslationCacheEntry = {
            key: cacheKey,
            originalText: text,
            textHash,
            sourceLang: response.detectedSourceLang || request.sourceLang,
            targetLang: this.config.targetLang,
            provider: providerConfig.provider,
            modelVersion: providerConfig.modelVersion,
            promptVersion: this.config.promptVersion || 'v1',
            translatedText: response.translatedText,
            contentVersion,
            cfi,
            bookHash,
            cachedAt: Date.now(),
            lastAccessedAt: Date.now(),
          };

          await this.cache.set(cacheEntry);

          const result: TranslationResult = {
            originalText: text,
            translatedText: response.translatedText,
            sourceLang: response.detectedSourceLang || request.sourceLang,
            targetLang: this.config.targetLang,
            fromCache: false,
            cfi,
            bookHash,
            metadata: response.metadata,
          };

          resolve(result);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            reject(new Error('Translation request was cancelled'));
          } else {
            reject(error as Error);
          }
        } finally {
          this.activeRequests--;
          this.pendingRequests.delete(cacheKey);
          this.processQueue();
        }
      };

      // Queue or execute immediately
      if (this.activeRequests >= (this.config.maxConcurrency || 3)) {
        this.requestQueue.push(executeRequest);
      } else {
        executeRequest();
      }
    });

    return promise;
  }

  /**
   * Cancel translation request
   */
  cancel(cacheKey: string): void {
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      pending.abortController.abort();
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    for (const [key, pending] of this.pendingRequests.entries()) {
      pending.abortController.abort();
      this.pendingRequests.delete(key);
    }
    this.requestQueue = [];
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    while (
      this.requestQueue.length > 0 &&
      this.activeRequests < (this.config.maxConcurrency || 3)
    ) {
      const executeRequest = this.requestQueue.shift()!;
      executeRequest();
    }
  }

  /**
   * Reset daily request count if date changed
   */
  private resetDailyCountIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyRequestCount = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Get usage statistics
   */
  getStats(): {
    activeRequests: number;
    queuedRequests: number;
    dailyRequestCount: number;
    dailyRequestLimit: number;
  } {
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      dailyRequestCount: this.dailyRequestCount,
      dailyRequestLimit: this.config.dailyRequestLimit || 1000,
    };
  }

  /**
   * Invalidate cache for a book
   */
  async invalidateBookCache(bookHash: string): Promise<void> {
    await this.cache.invalidateBook(bookHash);
  }
}

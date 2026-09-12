/**
 * Tests for Translation Controller
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranslationController } from '../translation-controller';
import type { ReaderPort } from '../../../core/ports';
import type { TextSelection } from '../../../core/models';
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResponse,
} from '../translation-provider';

// Mock ReaderPort
const createMockReaderPort = (): ReaderPort => ({
  getTextSelection: vi.fn(),
  resolveLocation: vi.fn(),
  getCurrentLocation: vi.fn(),
  getReadingProgress: vi.fn(),
  getCurrentBookHash: vi.fn(),
  goToLocation: vi.fn(),
});

// Mock TranslationProvider
const createMockProvider = (translatedText: string = 'Translated text'): TranslationProvider => ({
  translate: vi.fn(async (request: TranslationRequest): Promise<TranslationResponse> => {
    return {
      translatedText,
      detectedSourceLang: request.sourceLang,
      metadata: { provider: 'mock' },
    };
  }),
  isAvailable: vi.fn(async () => true),
  getConfig: vi.fn(() => ({
    provider: 'deepl',
    modelVersion: 'deepl-pro',
    timeout: 30000,
    maxRetries: 1,
  })),
});

describe('TranslationController', () => {
  let readerPort: ReaderPort;
  let provider: TranslationProvider;
  let controller: TranslationController;

  beforeEach(() => {
    readerPort = createMockReaderPort();
    provider = createMockProvider();
    controller = new TranslationController(readerPort, {
      provider,
      targetLang: 'zh',
      defaultSourceLang: 'en',
      maxConcurrency: 3,
      dailyRequestLimit: 100,
      promptVersion: 'v1',
    });
  });

  describe('translateSelection', () => {
    it('should translate selected text', async () => {
      const selection: TextSelection = {
        text: 'Hello, world!',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        index: 0,
        page: 1,
      };

      vi.mocked(readerPort.getTextSelection).mockResolvedValue(selection);

      const result = await controller.translateSelection('book123');

      expect(result).toBeDefined();
      expect(result?.originalText).toBe('Hello, world!');
      expect(result?.translatedText).toBe('Translated text');
      expect(result?.cfi).toBe('epubcfi(/6/4!/4/2/8:12)');
      expect(result?.bookHash).toBe('book123');
    });

    it('should return null when no selection', async () => {
      vi.mocked(readerPort.getTextSelection).mockResolvedValue(null);

      const result = await controller.translateSelection('book123');

      expect(result).toBeNull();
    });
  });

  describe('translate', () => {
    it('should translate text and cache result', async () => {
      const result = await controller.translate({
        text: 'Hello',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        contentVersion: 'book123_v1',
        sourceLang: 'en',
      });

      expect(result.translatedText).toBe('Translated text');
      expect(result.fromCache).toBe(false);

      // Second call should use cache
      const result2 = await controller.translate({
        text: 'Hello',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        contentVersion: 'book123_v1',
        sourceLang: 'en',
      });

      expect(result2.translatedText).toBe('Translated text');
      expect(result2.fromCache).toBe(true);

      // Provider should only be called once
      expect(provider.translate).toHaveBeenCalledTimes(1);
    });

    it('should respect daily request limit', async () => {
      // Set very low limit
      controller = new TranslationController(readerPort, {
        provider,
        targetLang: 'zh',
        dailyRequestLimit: 1,
      });

      // First request should succeed
      await controller.translate({
        text: 'Hello',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        contentVersion: 'book123_v1',
      });

      // Second request should fail
      await expect(
        controller.translate({
          text: 'World',
          cfi: 'epubcfi(/6/4!/4/2/8:13)',
          bookHash: 'book123',
          contentVersion: 'book123_v1',
        }),
      ).rejects.toThrow('Daily translation request limit reached');
    });

    it('should not cache on cancelled request', async () => {
      const slowProvider: TranslationProvider = {
        ...createMockProvider(),
        translate: vi.fn(async (request: TranslationRequest) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve({
                translatedText: 'Slow translation',
                detectedSourceLang: 'en',
              });
            }, 1000);

            request.signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('AbortError'));
            });
          });
        }),
      };

      controller = new TranslationController(readerPort, {
        provider: slowProvider,
        targetLang: 'zh',
      });

      const promise = controller.translate({
        text: 'Hello',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        contentVersion: 'book123_v1',
      });

      // Cancel immediately
      const textHash = (await import('../translation-cache')).TranslationCache.hashText('Hello');
      const cacheKey = (await import('../translation-cache')).TranslationCache.generateCacheKey({
        textHash,
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
      });
      controller.cancel(cacheKey);

      await expect(promise).rejects.toThrow();
    });
  });

  describe('concurrency control', () => {
    it('should respect max concurrency', async () => {
      const delays: number[] = [];
      let activeCount = 0;
      let maxActive = 0;

      const concurrentProvider: TranslationProvider = {
        ...createMockProvider(),
        translate: vi.fn(async () => {
          activeCount++;
          maxActive = Math.max(maxActive, activeCount);

          await new Promise((resolve) => setTimeout(resolve, 50));

          activeCount--;
          return {
            translatedText: 'Done',
            detectedSourceLang: 'en',
          };
        }),
      };

      controller = new TranslationController(readerPort, {
        provider: concurrentProvider,
        targetLang: 'zh',
        maxConcurrency: 2,
      });

      // Fire 5 requests simultaneously
      const promises = Array.from({ length: 5 }, (_, i) =>
        controller.translate({
          text: `Text ${i}`,
          cfi: `epubcfi(/6/4!/4/2/8:${i})`,
          bookHash: 'book123',
          contentVersion: 'book123_v1',
        }),
      );

      await Promise.all(promises);

      // Max active should not exceed concurrency limit
      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });

  describe('getStats', () => {
    it('should return usage statistics', () => {
      const stats = controller.getStats();

      expect(stats).toHaveProperty('activeRequests');
      expect(stats).toHaveProperty('queuedRequests');
      expect(stats).toHaveProperty('dailyRequestCount');
      expect(stats).toHaveProperty('dailyRequestLimit');
    });
  });
});

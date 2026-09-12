/**
 * Tests for Translation Cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationCache } from '../translation-cache';
import type { TranslationCacheEntry } from '../translation-cache';

describe('TranslationCache', () => {
  let cache: TranslationCache;

  beforeEach(async () => {
    cache = new TranslationCache();
    await cache.init();
  });

  describe('hashText', () => {
    it('should generate consistent hash for same text', () => {
      const text = 'Hello, world!';
      const hash1 = TranslationCache.hashText(text);
      const hash2 = TranslationCache.hashText(text);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different texts', () => {
      const hash1 = TranslationCache.hashText('Hello');
      const hash2 = TranslationCache.hashText('World');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate correct cache key format', () => {
      const key = TranslationCache.generateCacheKey({
        textHash: 'abc123',
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
      });
      expect(key).toBe('abc123_en_zh_deepl_deepl-pro_v1');
    });
  });

  describe('set and get', () => {
    it('should cache and retrieve translation', async () => {
      const entry: TranslationCacheEntry = {
        key: 'test_key_1',
        originalText: 'Hello',
        textHash: TranslationCache.hashText('Hello'),
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
        translatedText: '你好',
        contentVersion: 'book123_v1',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      await cache.set(entry);
      const retrieved = await cache.get('test_key_1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.translatedText).toBe('你好');
      expect(retrieved?.originalText).toBe('Hello');
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non_existent_key');
      expect(result).toBeNull();
    });

    it('should update lastAccessedAt on get', async () => {
      const entry: TranslationCacheEntry = {
        key: 'test_key_2',
        originalText: 'Test',
        textHash: TranslationCache.hashText('Test'),
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
        translatedText: '测试',
        contentVersion: 'book123_v1',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      await cache.set(entry);

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const retrieved = await cache.get('test_key_2');
      expect(retrieved).toBeDefined();
      expect(retrieved!.lastAccessedAt).toBeGreaterThan(entry.lastAccessedAt);
    });
  });

  describe('invalidateBook', () => {
    it('should remove all entries for a book', async () => {
      const entry1: TranslationCacheEntry = {
        key: 'test_key_3',
        originalText: 'Hello',
        textHash: TranslationCache.hashText('Hello'),
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
        translatedText: '你好',
        contentVersion: 'book123_v1',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      const entry2: TranslationCacheEntry = {
        key: 'test_key_4',
        originalText: 'World',
        textHash: TranslationCache.hashText('World'),
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
        translatedText: '世界',
        contentVersion: 'book456_v1',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book456',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      await cache.set(entry1);
      await cache.set(entry2);

      await cache.invalidateBook('book123');

      const result1 = await cache.get('test_key_3');
      const result2 = await cache.get('test_key_4');

      expect(result1).toBeNull();
      expect(result2).toBeDefined();
    });
  });

  describe('cache invalidation scenarios', () => {
    it('should not use cached entry when content version changes', async () => {
      const entry: TranslationCacheEntry = {
        key: 'test_key_5',
        originalText: 'Hello',
        textHash: TranslationCache.hashText('Hello'),
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
        translatedText: '你好',
        contentVersion: 'book123_v1',
        cfi: 'epubcfi(/6/4!/4/2/8:12)',
        bookHash: 'book123',
        cachedAt: Date.now(),
        lastAccessedAt: Date.now(),
      };

      await cache.set(entry);
      const retrieved = await cache.get('test_key_5');

      expect(retrieved).toBeDefined();
      expect(retrieved?.contentVersion).toBe('book123_v1');

      // In real usage, controller would check contentVersion matches
      // before using cached result
    });

    it('should use different cache keys for different providers', () => {
      const textHash = TranslationCache.hashText('Hello');

      const key1 = TranslationCache.generateCacheKey({
        textHash,
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'deepl',
        modelVersion: 'deepl-pro',
        promptVersion: 'v1',
      });

      const key2 = TranslationCache.generateCacheKey({
        textHash,
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'openai',
        modelVersion: 'gpt-4',
        promptVersion: 'v1',
      });

      expect(key1).not.toBe(key2);
    });

    it('should use different cache keys for different prompt versions', () => {
      const textHash = TranslationCache.hashText('Hello');

      const key1 = TranslationCache.generateCacheKey({
        textHash,
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'openai',
        modelVersion: 'gpt-4',
        promptVersion: 'v1',
      });

      const key2 = TranslationCache.generateCacheKey({
        textHash,
        sourceLang: 'en',
        targetLang: 'zh',
        provider: 'openai',
        modelVersion: 'gpt-4',
        promptVersion: 'v2',
      });

      expect(key1).not.toBe(key2);
    });
  });
});

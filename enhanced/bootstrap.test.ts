/**
 * Bootstrap Lifecycle Tests
 *
 * Verifies that enhanced features can be initialized and shut down cleanly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeEnhanced,
  shutdownEnhanced,
  isEnhancedInitialized,
  getPort,
  registerCleanup,
  isFeatureEnabled,
} from './bootstrap';
import type { ReaderPort, LibraryPort } from './core/ports';

describe('Enhanced Bootstrap', () => {
  afterEach(async () => {
    await shutdownEnhanced();
  });

  it('should initialize with empty config', async () => {
    await initializeEnhanced({});
    expect(isEnhancedInitialized()).toBe(true);
  });

  it('should register and retrieve port implementations', async () => {
    const mockReader: ReaderPort = {
      getTextSelection: async () => null,
      resolveLocation: async () => ({ index: 0, text: '', cfi: '' }),
      getCurrentLocation: async () => '',
      getReadingProgress: async () => ({
        percent: 0,
        currentPage: 1,
        totalPages: 1,
        cfi: '',
        section: 0,
      }),
      getCurrentBookHash: async () => null,
      goToLocation: async () => {},
    };

    await initializeEnhanced({
      ports: { reader: mockReader },
    });

    const retrieved = getPort('reader');
    expect(retrieved).toBe(mockReader);
  });

  it('should execute cleanup handlers on shutdown', async () => {
    let cleanupCalled = false;

    await initializeEnhanced({});
    registerCleanup(() => {
      cleanupCalled = true;
    });

    await shutdownEnhanced();
    expect(cleanupCalled).toBe(true);
    expect(isEnhancedInitialized()).toBe(false);
  });

  it('should execute async cleanup handlers', async () => {
    const cleanupOrder: number[] = [];

    await initializeEnhanced({});
    registerCleanup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cleanupOrder.push(1);
    });
    registerCleanup(async () => {
      cleanupOrder.push(2);
    });

    await shutdownEnhanced();
    expect(cleanupOrder).toContain(1);
    expect(cleanupOrder).toContain(2);
  });

  it('should prevent double initialization', async () => {
    await initializeEnhanced({});
    await expect(initializeEnhanced({})).rejects.toThrow('Enhanced features already initialized');
  });

  it('should allow re-initialization after shutdown', async () => {
    await initializeEnhanced({});
    await shutdownEnhanced();
    await initializeEnhanced({});
    expect(isEnhancedInitialized()).toBe(true);
  });

  it('should handle shutdown with no initialization', async () => {
    await expect(shutdownEnhanced()).resolves.not.toThrow();
  });

  it('should handle multiple shutdowns safely', async () => {
    await initializeEnhanced({});
    await shutdownEnhanced();
    await expect(shutdownEnhanced()).resolves.not.toThrow();
  });

  it('should continue cleanup even if one handler fails', async () => {
    const cleanupOrder: number[] = [];

    await initializeEnhanced({});
    registerCleanup(() => {
      cleanupOrder.push(1);
    });
    registerCleanup(() => {
      throw new Error('Cleanup error');
    });
    registerCleanup(() => {
      cleanupOrder.push(3);
    });

    await shutdownEnhanced();
    expect(cleanupOrder).toEqual([1, 3]);
  });

  it('should return false for all feature flags by default', () => {
    expect(isFeatureEnabled('importPlatform')).toBe(false);
    expect(isFeatureEnabled('eudic')).toBe(false);
    expect(isFeatureEnabled('translate')).toBe(false);
    expect(isFeatureEnabled('tts')).toBe(false);
  });
});

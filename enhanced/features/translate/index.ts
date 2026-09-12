/**
 * Translation Feature - Public API
 *
 * Provides bubble/sidebar translation with caching for selected text
 */

export {
  TranslationCache,
  getTranslationCache,
  TranslationCache as Cache,
} from './translation-cache';
export type { TranslationCacheEntry, CacheKey } from './translation-cache';

export {
  createTranslationProvider,
  DeepLProvider,
  OpenAIProvider,
  LocalProvider,
} from './translation-provider';
export type {
  TranslationRequest,
  TranslationResponse,
  TranslationProvider,
  TranslationProviderConfig,
} from './translation-provider';

export { TranslationController } from './translation-controller';
export type { TranslationControllerConfig, TranslationResult } from './translation-controller';

export { BubbleUI } from './bubble-ui';
export type { BubbleUIConfig } from './bubble-ui';

export { SidebarUI } from './sidebar-ui';
export type { SidebarUIConfig } from './sidebar-ui';

/**
 * Convenience function to create a translation controller with provider
 */
export async function createTranslationController(params: {
  readerPort: any; // ReaderPort from core/ports
  provider: 'deepl' | 'openai' | 'local';
  apiKey: string;
  modelVersion: string;
  targetLang: string;
  sourceLang?: string;
  maxConcurrency?: number;
  dailyRequestLimit?: number;
}): Promise<any> {
  const { TranslationController } = await import('./translation-controller');
  const { createTranslationProvider } = await import('./translation-provider');

  const provider = createTranslationProvider({
    provider: params.provider,
    apiKey: params.apiKey,
    modelVersion: params.modelVersion,
  });

  return new TranslationController(params.readerPort, {
    provider,
    targetLang: params.targetLang,
    defaultSourceLang: params.sourceLang,
    maxConcurrency: params.maxConcurrency,
    dailyRequestLimit: params.dailyRequestLimit,
  });
}

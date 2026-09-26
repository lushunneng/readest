/**
 * Translation Provider - Abstraction for translation services
 *
 * Supports multiple providers:
 * - DeepL (deepl-pro, deepl-free)
 * - OpenAI (gpt-4, gpt-3.5-turbo)
 * - Local models (custom-v1)
 */

export interface TranslationRequest {
  /** Text to translate */
  text: string;

  /** Source language (ISO 639-1) */
  sourceLang: string;

  /** Target language (ISO 639-1) */
  targetLang: string;

  /** Optional context for better translation */
  context?: string;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface TranslationResponse {
  /** Translated text */
  translatedText: string;

  /** Detected source language (may differ from request) */
  detectedSourceLang?: string;

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface TranslationProviderConfig {
  /** Provider type */
  provider: 'deepl' | 'openai' | 'local';

  /** Model version */
  modelVersion: string;

  /** API key (if required) */
  apiKey?: string;

  /** API endpoint (for custom deployments) */
  endpoint?: string;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Maximum retries */
  maxRetries?: number;
}

export interface TranslationProvider {
  /**
   * Translate text
   */
  translate(request: TranslationRequest): Promise<TranslationResponse>;

  /**
   * Check if provider is available and configured
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get provider configuration
   */
  getConfig(): TranslationProviderConfig;
}

/**
 * DeepL Translation Provider
 */
export class DeepLProvider implements TranslationProvider {
  constructor(private config: TranslationProviderConfig) {
    if (!config.apiKey) {
      throw new Error('DeepL API key is required');
    }
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const { text, sourceLang, targetLang, signal } = request;

    const endpoint = this.config.endpoint || 'https://api-free.deepl.com/v2/translate';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);

    // Combine signals
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: [text],
          source_lang: sourceLang.toUpperCase(),
          target_lang: targetLang.toUpperCase(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`DeepL API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        translatedText: data.translations[0].text,
        detectedSourceLang: data.translations[0].detected_source_language?.toLowerCase(),
        metadata: {
          provider: 'deepl',
          modelVersion: this.config.modelVersion,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  getConfig(): TranslationProviderConfig {
    return this.config;
  }
}

/**
 * OpenAI Translation Provider
 */
export class OpenAIProvider implements TranslationProvider {
  private promptVersion = 'v1';

  constructor(private config: TranslationProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const { text, sourceLang, targetLang, context, signal } = request;

    const endpoint = this.config.endpoint || 'https://api.openai.com/v1/chat/completions';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);

    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const systemPrompt = `You are a professional translator. Translate the given text from ${sourceLang} to ${targetLang}. Maintain the tone, style, and formatting of the original text. Return only the translated text without explanations.`;

    const userPrompt = context
      ? `Context: ${context}\n\nTranslate this text:\n${text}`
      : `Translate this text:\n${text}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.modelVersion || 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        translatedText: data.choices[0].message.content.trim(),
        metadata: {
          provider: 'openai',
          modelVersion: this.config.modelVersion,
          promptVersion: this.promptVersion,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  getConfig(): TranslationProviderConfig {
    return this.config;
  }

  getPromptVersion(): string {
    return this.promptVersion;
  }
}

/**
 * Local Translation Provider.
 *
 * The local provider intentionally talks to an explicitly configured local
 * endpoint instead of pretending that the browser can translate offline. A
 * small HTTP adapter is enough for Ollama, LocalAI, or an app-owned service.
 * The endpoint must return `{ translatedText: string }` (or
 * `{ translation: string }`) and may include `detectedSourceLang`.
 */
export class LocalProvider implements TranslationProvider {
  constructor(private config: TranslationProviderConfig) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const endpoint = this.config.endpoint?.trim();
    if (!endpoint) {
      throw new Error('A local translation endpoint is required');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);
    const abortRequest = () => controller.abort();
    request.signal?.addEventListener('abort', abortRequest, { once: true });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          sourceLang: request.sourceLang,
          targetLang: request.targetLang,
          context: request.context,
          model: this.config.modelVersion,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Local translation API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as {
        translatedText?: unknown;
        translation?: unknown;
        detectedSourceLang?: unknown;
      };
      const translatedText =
        typeof data.translatedText === 'string'
          ? data.translatedText
          : typeof data.translation === 'string'
            ? data.translation
            : null;

      if (!translatedText?.trim()) {
        throw new Error('Local translation API returned no translated text');
      }

      return {
        translatedText,
        detectedSourceLang:
          typeof data.detectedSourceLang === 'string' ? data.detectedSourceLang : undefined,
        metadata: {
          provider: 'local',
          modelVersion: this.config.modelVersion,
          endpoint,
        },
      };
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortRequest);
    }
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.config.endpoint?.trim());
  }

  getConfig(): TranslationProviderConfig {
    return this.config;
  }
}

/**
 * Provider factory
 */
export function createTranslationProvider(config: TranslationProviderConfig): TranslationProvider {
  switch (config.provider) {
    case 'deepl':
      return new DeepLProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'local':
      return new LocalProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

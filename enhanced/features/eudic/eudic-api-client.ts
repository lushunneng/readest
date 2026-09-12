/**
 * Eudic Open API Client
 *
 * Implementation per v5-report.md recommendations:
 * - Exponential backoff retry (3 attempts, 1s/2s/4s)
 * - 409/400 treated as "already exists"
 * - Token from environment variable
 */

export interface EudicWord {
  word: string;
  definition?: string;
  example?: string;
}

export interface AddWordRequest {
  id: number; // Study list ID (0 = default)
  language: string; // Language code (e.g., 'en')
  words: EudicWord[];
}

export interface EudicApiError extends Error {
  status?: number;
  code?: string;
}

const API_BASE_URL = 'https://api.frdic.com/api/open/v1';
const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000; // 1 second
const BACKOFF_FACTOR = 2;

/**
 * Eudic API client with retry logic
 */
export class EudicApiClient {
  private token: string | null = null;
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;

  constructor(token?: string) {
    // Token from constructor or environment variable
    this.token = token || this.getTokenFromEnv();
  }

  private getTokenFromEnv(): string | null {
    // In browser environment, this would come from settings/config
    // In Node.js, from process.env
    if (typeof process !== 'undefined' && process.env) {
      return process.env.EUDIC_TOKEN || null;
    }
    return null;
  }

  /**
   * Check if API is available and token is configured
   */
  isConfigured(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  /**
   * Check if API is in degraded mode (too many failures)
   */
  isDegraded(): boolean {
    return this.consecutiveFailures >= this.maxConsecutiveFailures;
  }

  /**
   * Add words to study list
   *
   * Per v5-report.md section 2.2:
   * - Catches 409/400 as "already exists"
   * - Retries on network errors
   */
  async addWords(words: EudicWord[]): Promise<void> {
    if (!this.isConfigured()) {
      throw this.createError('EUDIC_TOKEN not configured', 401, 'NOT_CONFIGURED');
    }

    if (this.isDegraded()) {
      throw this.createError('Eudic API in degraded mode', 503, 'DEGRADED');
    }

    const request: AddWordRequest = {
      id: 0, // Default study list
      language: 'en',
      words,
    };

    try {
      await this.retryRequest(async () => {
        const response = await fetch(`${API_BASE_URL}/studylist/words`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(request),
        });

        // Success
        if (response.ok) {
          this.consecutiveFailures = 0;
          return;
        }

        // Already exists - treat as success per v5-report.md section 2.2
        if (response.status === 409 || response.status === 400) {
          console.log(`Word already exists in Eudic (${response.status}), treating as success`);
          this.consecutiveFailures = 0;
          return;
        }

        // Authentication error - don't retry
        if (response.status === 401 || response.status === 403) {
          throw this.createError('Authentication failed', response.status, 'AUTH_FAILED');
        }

        // Other errors - will retry
        const errorText = await response.text().catch(() => 'Unknown error');
        throw this.createError(`API error: ${errorText}`, response.status, 'API_ERROR');
      });
    } catch (error) {
      this.consecutiveFailures++;
      throw error;
    }
  }

  /**
   * Check if a word exists in study list
   *
   * Note: This endpoint is not documented in v5-report.md
   * Implementation is tentative and may need adjustment
   */
  async hasWord(word: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Try common patterns for query endpoint
      const response = await fetch(
        `${API_BASE_URL}/studylist/words?word=${encodeURIComponent(word)}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        // Adjust based on actual response format
        return Array.isArray(data) ? data.length > 0 : !!data;
      }

      // If query endpoint doesn't exist, return false to allow write attempt
      if (response.status === 404) {
        return false;
      }

      return false;
    } catch (error) {
      console.warn('Failed to query word existence:', error);
      return false;
    }
  }

  /**
   * Retry logic with exponential backoff
   *
   * Per v5-report.md section 3.2:
   * - 3 retries max
   * - 1s/2s/4s exponential backoff
   * - Retries on 408, 429, 500, 502, 503, 504
   */
  private async retryRequest<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    let delay = INITIAL_DELAY;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const apiError = error as EudicApiError;

        // Don't retry auth errors
        if (apiError.status === 401 || apiError.status === 403) {
          throw error;
        }

        // Last attempt failed
        if (attempt === MAX_RETRIES) {
          break;
        }

        // Determine if we should retry
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        const shouldRetry = apiError.status && retryableStatuses.includes(apiError.status);

        if (!shouldRetry && apiError.status) {
          // Non-retryable error
          throw error;
        }

        // Wait before retry
        console.log(`Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
        await this.sleep(delay);
        delay *= BACKOFF_FACTOR;
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createError(message: string, status?: number, code?: string): EudicApiError {
    const error = new Error(message) as EudicApiError;
    error.status = status;
    error.code = code;
    return error;
  }

  /**
   * Reset degraded state (call after user fixes config or network recovers)
   */
  resetDegradedState(): void {
    this.consecutiveFailures = 0;
  }
}

/**
 * Local AI Provider — heuristic fallback when the gateway is unavailable.
 *
 * No network calls. No credentials. Produces canned responses based on
 * request type so the UI degrades gracefully rather than showing an error.
 *
 * This is intentionally minimal. It exists to:
 *   - Keep the UI functional offline or when the gateway is down.
 *   - Provide a stable test double for unit tests.
 *
 * The responses here are clearly labeled as offline fallbacks, not
 * AI-generated content, so users know what they're getting.
 */

import type { AIProvider, StudyRequest, StudyChunk, StudyResponse } from './ai-provider';

const FALLBACK_MESSAGES: Record<string, string> = {
  explain_slang:
    '[Offline] The AI study assistant is not available right now. ' +
    'Try looking up the phrase in a dictionary for context.',
  simplify_sentence:
    '[Offline] The AI study assistant is not available right now. ' +
    'Reading the sentence aloud slowly may help clarify its meaning.',
  summarize:
    '[Offline] The AI study assistant is not available right now. ' +
    'Try identifying the key nouns and verbs in each paragraph for a manual summary.',
  ask_question:
    '[Offline] The AI study assistant is not available right now. ' +
    'Your question has been noted — try again when connectivity is restored.',
};

export class LocalProvider implements AIProvider {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async *stream(request: StudyRequest): AsyncGenerator<StudyChunk, StudyResponse, undefined> {
    if (request.signal?.aborted) {
      const err = { code: 'CANCELLED' as const, message: 'Cancelled before start' };
      throw err;
    }

    const text = FALLBACK_MESSAGES[request.type] ?? '[Offline] AI study assistant unavailable.';

    // Yield the full text as a single chunk so callers don't need to handle
    // partial updates differently for the local provider.
    yield { delta: text, done: false };
    yield { delta: '', done: true };

    return { text, provider: 'local', truncated: false };
  }
}

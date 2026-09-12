/**
 * Gateway AI Provider — routes study requests to the server-side LLM gateway.
 *
 * Security rules enforced here:
 *   - No third-party API keys on the client; the gateway holds credentials.
 *   - Only the user-selected text and its enclosing article text are sent.
 *   - All responses stream over SSE so the AbortSignal can cancel mid-stream.
 *   - Quota errors surface as ProviderError with code QUOTA_EXCEEDED and
 *     a retryAfterMs hint so the UI can show a countdown.
 *
 * The gateway URL is injected at construction time from environment config,
 * never hardcoded, so staging and production point to different endpoints.
 */

import type {
  AIProvider,
  StudyRequest,
  StudyChunk,
  StudyResponse,
  ProviderError,
} from './ai-provider';

/** Minimal shape expected from each SSE data line */
interface GatewayChunk {
  delta?: string;
  done?: boolean;
  error?: { code: string; message: string; retry_after_ms?: number };
}

export class GatewayProvider implements AIProvider {
  private readonly gatewayUrl: string;
  private readonly timeoutMs: number;

  constructor(gatewayUrl: string, timeoutMs = 30_000) {
    this.gatewayUrl = gatewayUrl;
    this.timeoutMs = timeoutMs;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5_000);
      const res = await fetch(`${this.gatewayUrl}/health`, {
        signal: controller.signal,
        method: 'GET',
      });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }

  async *stream(request: StudyRequest): AsyncGenerator<StudyChunk, StudyResponse, undefined> {
    const { selectedText, articleContext, type, question, signal } = request;

    // Only the selected text and enclosing article text leave the client.
    const body = JSON.stringify({
      type,
      selected_text: selectedText,
      article_text: articleContext.text,
      question: type === 'ask_question' ? question : undefined,
    });

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);

    // Combine caller's signal with our timeout signal.
    const combined = signal
      ? abortWhenEither(signal, timeoutController.signal)
      : timeoutController.signal;

    let response: Response;
    try {
      response = await fetch(`${this.gatewayUrl}/study/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body,
        signal: combined,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      throw makeProviderError(err, signal);
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      await handleHttpError(response);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assembled = '';
    let truncated = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break;

          let chunk: GatewayChunk;
          try {
            chunk = JSON.parse(raw) as GatewayChunk;
          } catch {
            continue;
          }

          if (chunk.error) {
            clearTimeout(timeoutId);
            const err: ProviderError = {
              code:
                chunk.error.code === 'QUOTA_EXCEEDED' ? 'QUOTA_EXCEEDED' : 'GATEWAY_UNAVAILABLE',
              message: chunk.error.message,
              retryAfterMs: chunk.error.retry_after_ms,
            };
            throw err;
          }

          if (chunk.delta) {
            assembled += chunk.delta;
            yield { delta: chunk.delta, done: false };
          }

          if (chunk.done) {
            truncated = !!(chunk as { truncated?: boolean }).truncated;
            break;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      reader.releaseLock();
    }

    return { text: assembled, provider: 'gateway', truncated };
  }
}

/** Combine two AbortSignals — fires when either fires. */
function abortWhenEither(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

function makeProviderError(err: unknown, callerSignal?: AbortSignal): ProviderError {
  if (callerSignal?.aborted) {
    return { code: 'CANCELLED', message: 'Request cancelled by caller' };
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { code: 'TIMEOUT', message: 'Request timed out' };
  }
  return { code: 'GATEWAY_UNAVAILABLE', message: String(err) };
}

async function handleHttpError(response: Response): Promise<never> {
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
    const err: ProviderError = {
      code: 'QUOTA_EXCEEDED',
      message: 'Rate limit exceeded',
      retryAfterMs,
    };
    throw err;
  }
  const err: ProviderError = {
    code: 'GATEWAY_UNAVAILABLE',
    message: `Gateway returned ${response.status}`,
  };
  throw err;
}

/**
 * StudyController — orchestrates AI study requests.
 *
 * Responsibilities:
 *   - Route requests to the gateway provider, with LocalProvider as fallback.
 *   - Enforce per-session quota before sending.
 *   - Write audit entries before and after each request.
 *   - Emit SSE chunks to the caller via an async generator.
 *   - Never expose third-party credentials; all LLM calls go through GatewayProvider.
 *
 * Context limits enforced here:
 *   - selectedText is capped at MAX_SELECTED_CHARS characters.
 *   - articleContext.text is capped at MAX_CONTEXT_CHARS characters.
 *   These limits are applied before the payload leaves the client.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AIProvider,
  StudyRequest,
  StudyChunk,
  StudyResponse,
  AuditEntry,
  StudyRequestType,
} from './ai-provider';
import { writeAuditEntry, countRequests } from './audit-log';
import { recordStudyEvent } from './study-stats';

const MAX_SELECTED_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 8_000;

/** Per-session quota: max requests in a rolling 24-hour window. */
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1_000;
const QUOTA_LIMIT = 200;

export interface StudyControllerOptions {
  gatewayProvider: AIProvider;
  localProvider: AIProvider;
}

export class StudyController {
  private readonly gateway: AIProvider;
  private readonly local: AIProvider;

  constructor({ gatewayProvider, localProvider }: StudyControllerOptions) {
    this.gateway = gatewayProvider;
    this.local = localProvider;
  }

  /**
   * Stream a study response.
   *
   * Yields StudyChunks while the response streams in, then returns the
   * completed StudyResponse. Callers pass an AbortSignal to cancel mid-stream.
   *
   * Falls back to LocalProvider when the gateway is unavailable or over quota.
   */
  async *stream(request: StudyRequest): AsyncGenerator<StudyChunk, StudyResponse, undefined> {
    // 1. Enforce context limits before anything leaves the client.
    const bounded = this.boundRequest(request);

    // 2. Quota check.
    const since = Date.now() - QUOTA_WINDOW_MS;
    const count = await countRequests(since);
    const overQuota = count >= QUOTA_LIMIT;

    // 3. Pick provider.
    const gatewayUp = !overQuota && (await this.gateway.isAvailable());
    const provider = gatewayUp ? this.gateway : this.local;
    const providerLabel: 'gateway' | 'local' = gatewayUp ? 'gateway' : 'local';

    // 4. Open audit entry (no content stored — only metadata).
    const requestId = uuidv4();
    const auditEntry: AuditEntry = {
      requestId,
      type: bounded.type,
      provider: providerLabel,
      selectedTextLength: bounded.selectedText.length,
      startedAt: Date.now(),
      cancelled: false,
    };
    await writeAuditEntry(auditEntry);

    // 5. Stream and collect.
    let response: StudyResponse;
    try {
      const gen = provider.stream(bounded);
      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          response = value as StudyResponse;
          break;
        }
        yield value as StudyChunk;
      }
    } catch (err) {
      const isCancelled =
        bounded.signal?.aborted || (err as { code?: string })?.code === 'CANCELLED';
      await writeAuditEntry({
        ...auditEntry,
        completedAt: Date.now(),
        cancelled: isCancelled,
        error: isCancelled ? 'CANCELLED' : String(err),
      });
      throw err;
    }

    // 6. Close audit entry and record stat event.
    await writeAuditEntry({
      ...auditEntry,
      completedAt: Date.now(),
      cancelled: false,
    });
    await recordStudyEvent({
      type: bounded.type,
      provider: providerLabel,
      truncated: response.truncated,
      timestamp: Date.now(),
    });

    return response;
  }

  /** Cap selectedText and articleContext.text to stay within server limits. */
  private boundRequest(req: StudyRequest): StudyRequest {
    return {
      ...req,
      selectedText: req.selectedText.slice(0, MAX_SELECTED_CHARS),
      articleContext: {
        ...req.articleContext,
        text: req.articleContext.text.slice(0, MAX_CONTEXT_CHARS),
      },
    };
  }
}

/**
 * Build system prompts for each study request type.
 * Exported for unit tests; not part of the public API surface.
 */
export function buildSystemPrompt(type: StudyRequestType): string {
  switch (type) {
    case 'explain_slang':
      return (
        'You are an English reading assistant. ' +
        'The user is reading an article and has selected a phrase or expression. ' +
        'Explain the meaning of the selected text in plain English suitable for a non-native speaker. ' +
        'Be concise (2-4 sentences). Do not summarize the article.'
      );
    case 'simplify_sentence':
      return (
        'You are an English reading assistant. ' +
        'The user has selected a difficult sentence. ' +
        'Rewrite it in simpler language while preserving the meaning. ' +
        'Return the simplified version only, without explanation.'
      );
    case 'summarize':
      return (
        'You are an English reading assistant. ' +
        'Summarize the provided article text in 3-5 sentences. ' +
        'Focus on the main argument or finding, not peripheral details.'
      );
    case 'ask_question':
      return (
        'You are an English reading assistant. ' +
        "Answer the user's question using only information present in the provided article text. " +
        'If the answer is not in the text, say so. Be concise.'
      );
  }
}

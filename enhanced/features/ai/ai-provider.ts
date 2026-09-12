/**
 * AI Provider abstraction for study features
 *
 * Contract: provider implementations must NOT hold third-party credentials
 * on the client side. All LLM calls go through the server-side gateway.
 * The local provider offers heuristic fallbacks with no network calls.
 *
 * Study feature scope (Phase 1):
 *   - Slang / idiom explanation
 *   - Difficult sentence simplification / rewrite
 *   - Passage summary
 *   - Context-bounded Q&A (user-selected text only)
 *
 * Out of scope for this phase: follow-reading (ASR), pronunciation scoring.
 */

import type { ArticleDocument } from '../../core/models';

/**
 * Types of AI study requests
 */
export type StudyRequestType = 'explain_slang' | 'simplify_sentence' | 'summarize' | 'ask_question';

/**
 * Input for a study request — context is strictly limited to
 * user-selected text plus the enclosing ArticleDocument.
 */
export interface StudyRequest {
  type: StudyRequestType;

  /** The user-selected text — the primary subject of the request */
  selectedText: string;

  /**
   * The ArticleDocument providing context.
   * Only the text field is sent to the gateway; other fields are
   * used locally for routing and never leave the client.
   */
  articleContext: Pick<ArticleDocument, 'content_id' | 'text' | 'source'>;

  /**
   * For ask_question: the user's question text
   */
  question?: string;

  /** AbortSignal for SSE cancellation */
  signal?: AbortSignal;
}

/**
 * A single chunk in a streaming study response
 */
export interface StudyChunk {
  /** Incremental text delta */
  delta: string;

  /** True on the final chunk */
  done: boolean;
}

/**
 * Completed study response after all chunks consumed
 */
export interface StudyResponse {
  /** Full assembled text */
  text: string;

  /** Provider that fulfilled the request */
  provider: 'gateway' | 'local';

  /** Whether the response was truncated (quota limit) */
  truncated: boolean;
}

/**
 * Provider error — structured so callers can handle quota vs network vs auth
 */
export interface ProviderError {
  code: 'QUOTA_EXCEEDED' | 'GATEWAY_UNAVAILABLE' | 'TIMEOUT' | 'CANCELLED' | 'UNKNOWN';
  message: string;
  retryAfterMs?: number;
}

/**
 * AI provider interface — all implementations must satisfy this contract.
 * The business layer (StudyController) only talks to this interface.
 */
export interface AIProvider {
  /**
   * Check if this provider is available (gateway reachable, quota not exhausted)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Stream a study response.
   *
   * Yields StudyChunks until done:true, then returns the full StudyResponse.
   * If the signal fires before completion, throws a ProviderError with code CANCELLED.
   */
  stream(request: StudyRequest): AsyncGenerator<StudyChunk, StudyResponse, undefined>;
}

/**
 * Audit log entry — every request is logged for quota tracking and debugging.
 * No content is stored; only metadata.
 */
export interface AuditEntry {
  requestId: string;
  type: StudyRequestType;
  provider: 'gateway' | 'local';
  /** Length of selectedText, not the text itself */
  selectedTextLength: number;
  startedAt: number;
  completedAt?: number;
  cancelled: boolean;
  error?: string;
}

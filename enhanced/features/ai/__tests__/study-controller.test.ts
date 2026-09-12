/**
 * StudyController unit tests
 *
 * These tests run in vitest (Node environment) and verify:
 *   - Gateway provider is preferred when available.
 *   - LocalProvider fallback fires when gateway is unavailable.
 *   - LocalProvider fallback fires when quota is exceeded.
 *   - AbortSignal cancellation propagates correctly.
 *   - Context limits (MAX_SELECTED_CHARS, MAX_CONTEXT_CHARS) are enforced.
 *   - Audit entries are written for every request.
 *   - buildSystemPrompt returns distinct, non-empty strings for each type.
 *
 * The audit-log and study-stats modules use IndexedDB which is not available
 * in Node. They are replaced with in-memory stubs below so the controller
 * logic can be tested without a browser runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudyController, buildSystemPrompt } from '../study-controller';
import type { AIProvider, StudyRequest, StudyChunk, StudyResponse } from '../ai-provider';

// ---------------------------------------------------------------------------
// Stubs for IndexedDB-dependent modules
// ---------------------------------------------------------------------------

vi.mock('../audit-log', () => ({
  writeAuditEntry: vi.fn().mockResolvedValue(undefined),
  countRequests: vi.fn().mockResolvedValue(0),
}));

vi.mock('../study-stats', () => ({
  recordStudyEvent: vi.fn().mockResolvedValue(undefined),
  getStudySummary: vi
    .fn()
    .mockResolvedValue({ totalRequests: 0, byType: {}, gatewayRequests: 0, localFallbacks: 0 }),
  pruneOldEvents: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProvider(
  available: boolean,
  text: string,
  providerLabel: 'gateway' | 'local' = 'gateway',
): AIProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(available),
    async *stream(_req: StudyRequest): AsyncGenerator<StudyChunk, StudyResponse, undefined> {
      yield { delta: text, done: false };
      yield { delta: '', done: true };
      return { text, provider: providerLabel, truncated: false };
    },
  };
}

function makeRequest(overrides: Partial<StudyRequest> = {}): StudyRequest {
  return {
    type: 'explain_slang',
    selectedText: 'kick the bucket',
    articleContext: {
      content_id: 'book1:cfi1',
      text: 'He kicked the bucket last night.',
      source: 'book1',
    },
    ...overrides,
  };
}

async function collectChunks(
  gen: AsyncGenerator<StudyChunk, StudyResponse, undefined>,
): Promise<{ chunks: StudyChunk[]; response: StudyResponse }> {
  const chunks: StudyChunk[] = [];
  while (true) {
    const { value, done } = await gen.next();
    if (done) return { chunks, response: value as StudyResponse };
    chunks.push(value as StudyChunk);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StudyController', () => {
  let gateway: AIProvider;
  let local: AIProvider;
  let controller: StudyController;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = makeProvider(true, 'gateway answer', 'gateway');
    local = makeProvider(true, 'offline fallback', 'local');
    controller = new StudyController({ gatewayProvider: gateway, localProvider: local });
  });

  it('uses the gateway provider when available', async () => {
    const { response } = await collectChunks(controller.stream(makeRequest()));
    expect(response.provider).toBe('gateway');
    expect(response.text).toBe('gateway answer');
  });

  it('falls back to LocalProvider when gateway is unavailable', async () => {
    gateway = makeProvider(false, 'gateway answer', 'gateway');
    controller = new StudyController({ gatewayProvider: gateway, localProvider: local });

    const { response } = await collectChunks(controller.stream(makeRequest()));
    expect(response.provider).toBe('local');
    expect(response.text).toBe('offline fallback');
  });

  it('falls back to LocalProvider when quota is exceeded', async () => {
    const { countRequests } = await import('../audit-log');
    vi.mocked(countRequests).mockResolvedValue(200);

    const { response } = await collectChunks(controller.stream(makeRequest()));
    expect(response.provider).toBe('local');
  });

  it('enforces MAX_SELECTED_CHARS = 2000', async () => {
    const longText = 'a'.repeat(3000);
    const captured: string[] = [];
    gateway = {
      isAvailable: vi.fn().mockResolvedValue(true),
      async *stream(req: StudyRequest) {
        captured.push(req.selectedText);
        yield { delta: 'ok', done: false };
        yield { delta: '', done: true };
        return { text: 'ok', provider: 'gateway' as const, truncated: false };
      },
    };
    controller = new StudyController({ gatewayProvider: gateway, localProvider: local });
    await collectChunks(controller.stream(makeRequest({ selectedText: longText })));
    expect(captured[0]!.length).toBe(2000);
  });

  it('enforces MAX_CONTEXT_CHARS = 8000', async () => {
    const longArticle = 'b'.repeat(10000);
    const captured: string[] = [];
    gateway = {
      isAvailable: vi.fn().mockResolvedValue(true),
      async *stream(req: StudyRequest) {
        captured.push(req.articleContext.text);
        yield { delta: 'ok', done: false };
        yield { delta: '', done: true };
        return { text: 'ok', provider: 'gateway' as const, truncated: false };
      },
    };
    controller = new StudyController({ gatewayProvider: gateway, localProvider: local });
    await collectChunks(
      controller.stream(
        makeRequest({
          articleContext: {
            content_id: 'x',
            text: longArticle,
            source: 'book1',
          },
        }),
      ),
    );
    expect(captured[0]!.length).toBe(8000);
  });

  it('writes audit entries for each request', async () => {
    const { writeAuditEntry } = await import('../audit-log');
    await collectChunks(controller.stream(makeRequest()));
    // Called at least twice: once to open, once to close.
    expect(vi.mocked(writeAuditEntry).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('records a study event after a successful request', async () => {
    const { recordStudyEvent } = await import('../study-stats');
    await collectChunks(controller.stream(makeRequest()));
    expect(vi.mocked(recordStudyEvent)).toHaveBeenCalledOnce();
  });

  it('marks audit entry as cancelled on abort', async () => {
    const { writeAuditEntry } = await import('../audit-log');
    const controller2 = new StudyController({
      gatewayProvider: {
        isAvailable: vi.fn().mockResolvedValue(true),
        async *stream(req: StudyRequest) {
          if (req.signal?.aborted) throw { code: 'CANCELLED', message: 'cancelled' };
          yield { delta: 'partial', done: false };
          throw { code: 'CANCELLED', message: 'cancelled' };
        },
      },
      localProvider: local,
    });

    const ac = new AbortController();
    ac.abort();

    await expect(
      collectChunks(controller2.stream(makeRequest({ signal: ac.signal }))),
    ).rejects.toMatchObject({ code: 'CANCELLED' });

    const calls = vi.mocked(writeAuditEntry).mock.calls;
    const closingCall = calls.find(([entry]) => entry.cancelled === true);
    expect(closingCall).toBeDefined();
  });
});

describe('buildSystemPrompt', () => {
  const types = ['explain_slang', 'simplify_sentence', 'summarize', 'ask_question'] as const;

  it('returns a non-empty string for every request type', () => {
    for (const type of types) {
      expect(buildSystemPrompt(type).length).toBeGreaterThan(20);
    }
  });

  it('returns distinct prompts for each type', () => {
    const prompts = types.map(buildSystemPrompt);
    const unique = new Set(prompts);
    expect(unique.size).toBe(types.length);
  });
});

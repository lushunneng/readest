/**
 * Public exports for the ai-study feature.
 *
 * Consumers import only from this index, not from internal modules.
 * This keeps the internal file structure flexible without breaking callers.
 */

export type {
  AIProvider,
  StudyRequest,
  StudyRequestType,
  StudyChunk,
  StudyResponse,
  ProviderError,
  AuditEntry,
} from './ai-provider';

export { LocalProvider } from './local-provider';
export { GatewayProvider } from './gateway-provider';
export { StudyController } from './study-controller';
export { buildSystemPrompt } from './study-controller';

export type { StudyEvent, StudySummary } from './study-stats';
export { recordStudyEvent, getStudySummary, pruneOldEvents } from './study-stats';

export { writeAuditEntry, getAuditEntries, countRequests, pruneOldEntries } from './audit-log';

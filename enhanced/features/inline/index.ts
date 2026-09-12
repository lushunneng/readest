/**
 * Inline bilingual translation — public exports
 *
 * Default OFF — only enabled when the bootstrap feature flag is set.
 * Translating a reflowable EPUB section requires these steps:
 *
 *   1. Gather paragraphs from the iframe doc and build InlineTranslationBlock[]
 *      using your translation controller (agent-translate).
 *   2. Call injectInlineStyles(doc) once per document load.
 *   3. Call injectInlineTranslation(doc, blocks, isFixedLayout).
 *      Check the returned skipped reason; if non-null, fall back to sidebar.
 *   4. On section unload (renderer 'relocate' or 'load' events), call
 *      cleanupInlineTranslation(doc) to remove all injected nodes.
 *
 * Fixed-layout (pre-paginated), PDF, and comic sections are detected by
 * callers via `bookDoc.rendition?.layout === 'pre-paginated'` or
 * `bookData.isFixedLayout`, matching the existing FoliateViewer pattern.
 */

export {
  isInlineTranslationEnabled,
  setInlineTranslationEnabled,
} from './inline-types';

export type {
  InlineTranslationBlock,
  InlineSkipReason,
  InlineInjectResult,
} from './inline-types';

export {
  injectInlineTranslation,
  cleanupInlineTranslation,
  injectInlineStyles,
  makeParagraphId,
} from './inline-injector';

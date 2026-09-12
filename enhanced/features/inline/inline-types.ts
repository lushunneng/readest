/**
 * Inline bilingual translation — types and feature flag
 *
 * Experimental feature, default OFF.
 *
 * The inline injector appends translated text nodes directly into the
 * iframe document via the standard DOM API, using the same `detail.doc`
 * hook that FoliateViewer already uses for themes, fonts and events.
 * No foliate-js submodule changes are required.
 *
 * Compatibility matrix:
 *   - Reflowable EPUB:           ✅ supported
 *   - Scrolled-mode EPUB:        ✅ supported
 *   - Fixed-layout / pre-paginated: ❌ degrades to sidebar (no reflow room)
 *   - PDF:                       ❌ degrades to sidebar
 *   - Comics / manga:            ❌ degrades to sidebar
 *   - TXT / plain text:          ✅ supported (no ruby overhead)
 *
 * Design principles:
 *   - Inject a <ruby> or inline <span> per paragraph; never mutate existing nodes.
 *   - Clean up ALL injected nodes on section unload / feature disable.
 *   - Preserve CFI stability: injected nodes carry data-inline-translation
 *     so they can be skipped by CFI and selection utilities.
 *   - The feature flag is read from enhanced/bootstrap.ts at runtime; the
 *     injector never enables itself.
 */

/** Whether the inline bilingual feature is active for this session. */
let _enabled = false;

export function isInlineTranslationEnabled(): boolean {
  return _enabled;
}

export function setInlineTranslationEnabled(value: boolean): void {
  _enabled = value;
}

/**
 * Inline translation result for one paragraph block.
 */
export interface InlineTranslationBlock {
  /**
   * XPath or DOM reference to the source paragraph.
   * The injector uses this to locate the paragraph after
   * a section reload without relying on brittle indices.
   */
  paragraphId: string;

  /** Original paragraph text (for cache keying) */
  originalText: string;

  /** Translated text to inject below the paragraph */
  translatedText: string;

  /** Source language detected by the translation provider */
  sourceLang: string;

  /** Target language */
  targetLang: string;
}

/**
 * Reasons why inline injection was not attempted.
 * Returned by injectInlineTranslation so callers can decide the fallback.
 */
export type InlineSkipReason =
  | 'feature_disabled'
  | 'fixed_layout' // pre-paginated / PDF / comic
  | 'no_paragraphs' // no <p> elements found in document
  | 'inject_error'; // DOM exception during injection

export interface InlineInjectResult {
  injected: number; // number of paragraphs decorated
  skipped: InlineSkipReason | null;
}

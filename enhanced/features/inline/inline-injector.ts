/**
 * Inline bilingual injector
 *
 * Injects translated paragraph text into a foliate-js iframe document.
 * Called from the `detail.doc` handler in FoliateViewer (or an equivalent
 * adapter) after translation results are available.
 *
 * Security constraints enforced here:
 *   - Never sets innerHTML on injected nodes; text is assigned via
 *     createTextNode to prevent XSS from translated content.
 *   - Never widens the iframe sandbox.
 *   - All injected elements carry data-inline-translation="1" so
 *     they can be excluded from CFI calculation and selection.
 *
 * Layout approach:
 *   - Wraps each source <p> in a <span class="inline-source"> (no-op visually).
 *   - Inserts a sibling <p class="inline-translation"> after it with the
 *     translated text in a muted style.
 *   - On cleanup, removes all [data-inline-translation] nodes from the document.
 *
 * Pagination note:
 *   - Injected nodes increase the document height. In paged mode the renderer
 *     re-paginates after DOM mutation. This is intentional: bilingual layout
 *     requires more pages. Users who prefer the original page count should
 *     use bubble/sidebar mode instead.
 */

import type { InlineTranslationBlock, InlineInjectResult, InlineSkipReason } from './inline-types';

/** CSS class applied to injected translation paragraphs */
const TRANSLATION_CLASS = 'enhanced-inline-translation';

/** data attribute marking all injected nodes for cleanup */
const TRANSLATION_ATTR = 'data-inline-translation';

/** Inline style applied to translation paragraphs */
const TRANSLATION_STYLE = [
  'font-size: 0.85em',
  'opacity: 0.72',
  'margin-top: 0.15em',
  'margin-bottom: 0.6em',
  'color: inherit',
  'font-style: italic',
].join('; ');

/**
 * Inject translated paragraphs into the iframe document.
 *
 * @param doc - The iframe's contentDocument (detail.doc from FoliateViewer)
 * @param blocks - Translation results, keyed by paragraphId (textContent fingerprint)
 * @param isFixedLayout - True for pre-paginated / PDF / comic — triggers sidebar fallback
 */
export function injectInlineTranslation(
  doc: Document,
  blocks: InlineTranslationBlock[],
  isFixedLayout: boolean,
): InlineInjectResult {
  if (isFixedLayout) {
    return { injected: 0, skipped: 'fixed_layout' };
  }

  if (blocks.length === 0) {
    return { injected: 0, skipped: 'no_paragraphs' };
  }

  // Build a lookup from paragraphId -> translation
  const byId = new Map(blocks.map((b) => [b.paragraphId, b]));

  const paragraphs = Array.from(doc.querySelectorAll('p, li, blockquote'));
  if (paragraphs.length === 0) {
    return { injected: 0, skipped: 'no_paragraphs' };
  }

  let injected = 0;

  try {
    for (const el of paragraphs) {
      const id = makeParagraphId(el);
      const block = byId.get(id);
      if (!block) continue;

      // Skip if already injected (section reload guard)
      if (el.nextElementSibling?.getAttribute(TRANSLATION_ATTR)) continue;

      const translation = doc.createElement('p');
      translation.setAttribute(TRANSLATION_ATTR, '1');
      translation.setAttribute('class', TRANSLATION_CLASS);
      translation.setAttribute('aria-label', `Translation: ${block.translatedText}`);
      translation.setAttribute('style', TRANSLATION_STYLE);

      // Use createTextNode — never innerHTML — to prevent XSS
      translation.appendChild(doc.createTextNode(block.translatedText));

      el.insertAdjacentElement('afterend', translation);
      injected++;
    }
  } catch (err) {
    console.error('[inline] inject error:', err);
    return { injected, skipped: 'inject_error' };
  }

  return { injected, skipped: null };
}

/**
 * Remove all injected translation nodes from a document.
 * Call this on section unload or when the feature is disabled.
 */
export function cleanupInlineTranslation(doc: Document): number {
  const nodes = doc.querySelectorAll(`[${TRANSLATION_ATTR}]`);
  let removed = 0;
  for (const node of nodes) {
    node.remove();
    removed++;
  }
  return removed;
}

/**
 * Build a stable paragraph identifier from the element's text content.
 * Uses the first 120 characters (enough to be unique within a section)
 * trimmed of whitespace. This is intentionally simple and avoids any
 * XPath dependency that might differ between browser engines.
 */
export function makeParagraphId(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Inject an inline stylesheet into the document.
 * Called once per document load to avoid repeated <style> insertions.
 */
export function injectInlineStyles(doc: Document): void {
  if (doc.getElementById('enhanced-inline-styles')) return;

  const style = doc.createElement('style');
  style.id = 'enhanced-inline-styles';
  style.setAttribute(TRANSLATION_ATTR, '1');
  style.textContent = `
    .${TRANSLATION_CLASS} {
      user-select: none;
      pointer-events: none;
    }
    @media print {
      .${TRANSLATION_CLASS} { display: none; }
    }
  `;
  doc.head?.appendChild(style);
}

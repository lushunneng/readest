/**
 * Inline injector unit tests
 *
 * These tests run in vitest with jsdom and verify:
 *   - Inject: translation paragraphs are inserted after source paragraphs.
 *   - No innerHTML: injection uses createTextNode only (XSS safety).
 *   - Idempotent: re-injecting the same doc does not duplicate nodes.
 *   - Cleanup: all injected nodes are removed.
 *   - Fixed-layout bypass: injection is skipped with 'fixed_layout' reason.
 *   - No-paragraphs bypass: empty docs skip with 'no_paragraphs' reason.
 *   - injectInlineStyles: stylesheet inserted once, not duplicated.
 *   - makeParagraphId: stable, trimmed, 120-char-limited fingerprint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  injectInlineTranslation,
  cleanupInlineTranslation,
  injectInlineStyles,
  makeParagraphId,
} from '../inline-injector';
import type { InlineTranslationBlock } from '../inline-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  return doc;
}

function makeBlock(originalText: string, translatedText: string): InlineTranslationBlock {
  return {
    paragraphId: originalText.slice(0, 120),
    originalText,
    translatedText,
    sourceLang: 'en',
    targetLang: 'zh',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('injectInlineTranslation', () => {
  let doc: Document;

  beforeEach(() => {
    doc = makeDoc(`
      <p>First paragraph text here.</p>
      <p>Second paragraph text here.</p>
    `);
  });

  it('inserts a translation paragraph after each matched source paragraph', () => {
    const blocks = [
      makeBlock('First paragraph text here.', '第一段文本在这里。'),
      makeBlock('Second paragraph text here.', '第二段文本在这里。'),
    ];
    const result = injectInlineTranslation(doc, blocks, false);

    expect(result.injected).toBe(2);
    expect(result.skipped).toBeNull();

    const paragraphs = doc.querySelectorAll('p');
    // 2 original + 2 injected
    expect(paragraphs.length).toBe(4);
    expect(paragraphs[1].textContent).toBe('第一段文本在这里。');
    expect(paragraphs[3].textContent).toBe('第二段文本在这里。');
  });

  it('marks injected nodes with data-inline-translation attribute', () => {
    const blocks = [makeBlock('First paragraph text here.', '译文。')];
    injectInlineTranslation(doc, blocks, false);

    const injected = doc.querySelectorAll('[data-inline-translation]');
    expect(injected.length).toBe(1);
    expect(injected[0].getAttribute('data-inline-translation')).toBe('1');
  });

  it('uses createTextNode — injected text is a text node, not innerHTML', () => {
    const xssAttempt = '<script>alert(1)</script>';
    const blocks = [makeBlock('First paragraph text here.', xssAttempt)];
    injectInlineTranslation(doc, blocks, false);

    const injected = doc.querySelector('[data-inline-translation]');
    // textContent should equal the raw string, no script element created
    expect(injected?.textContent).toBe(xssAttempt);
    expect(doc.querySelector('script')).toBeNull();
  });

  it('is idempotent — second injection does not duplicate nodes', () => {
    const blocks = [makeBlock('First paragraph text here.', '译文。')];
    injectInlineTranslation(doc, blocks, false);
    injectInlineTranslation(doc, blocks, false);

    const injected = doc.querySelectorAll('[data-inline-translation]');
    expect(injected.length).toBe(1);
  });

  it('skips with fixed_layout reason when isFixedLayout is true', () => {
    const blocks = [makeBlock('First paragraph text here.', '译文。')];
    const result = injectInlineTranslation(doc, blocks, true);

    expect(result.injected).toBe(0);
    expect(result.skipped).toBe('fixed_layout');
    expect(doc.querySelectorAll('[data-inline-translation]').length).toBe(0);
  });

  it('skips with no_paragraphs reason when blocks are empty', () => {
    const result = injectInlineTranslation(doc, [], false);

    expect(result.injected).toBe(0);
    expect(result.skipped).toBe('no_paragraphs');
  });

  it('skips with no_paragraphs reason when doc has no p/li/blockquote', () => {
    const emptyDoc = makeDoc('<div>No paragraphs here</div>');
    const blocks = [makeBlock('No paragraphs here', '无段落。')];
    const result = injectInlineTranslation(emptyDoc, blocks, false);

    expect(result.injected).toBe(0);
    expect(result.skipped).toBe('no_paragraphs');
  });

  it('only injects for blocks whose paragraphId matches a paragraph', () => {
    const blocks = [
      makeBlock('First paragraph text here.', '第一段。'),
      makeBlock('This text is not in the doc.', '不存在的文本。'),
    ];
    const result = injectInlineTranslation(doc, blocks, false);

    expect(result.injected).toBe(1);
    expect(result.skipped).toBeNull();
  });

  it('injected paragraph has aria-label with translated text', () => {
    const blocks = [makeBlock('First paragraph text here.', '第一段文本在这里。')];
    injectInlineTranslation(doc, blocks, false);

    const injected = doc.querySelector('[data-inline-translation]');
    expect(injected?.getAttribute('aria-label')).toBe('Translation: 第一段文本在这里。');
  });
});

describe('cleanupInlineTranslation', () => {
  it('removes all injected translation nodes', () => {
    const doc = makeDoc('<p>Hello world paragraph.</p>');
    const blocks = [makeBlock('Hello world paragraph.', '你好世界。')];
    injectInlineTranslation(doc, blocks, false);

    expect(doc.querySelectorAll('[data-inline-translation]').length).toBe(1);

    const removed = cleanupInlineTranslation(doc);
    expect(removed).toBe(1);
    expect(doc.querySelectorAll('[data-inline-translation]').length).toBe(0);
  });

  it('is safe to call on a doc with no injected nodes', () => {
    const doc = makeDoc('<p>No injections here.</p>');
    const removed = cleanupInlineTranslation(doc);
    expect(removed).toBe(0);
  });

  it('also removes the injected stylesheet', () => {
    const doc = makeDoc('<p>Some text.</p>');
    injectInlineStyles(doc);

    expect(doc.getElementById('enhanced-inline-styles')).not.toBeNull();

    cleanupInlineTranslation(doc);
    expect(doc.getElementById('enhanced-inline-styles')).toBeNull();
  });
});

describe('injectInlineStyles', () => {
  it('inserts a style element with id enhanced-inline-styles', () => {
    const doc = makeDoc('');
    injectInlineStyles(doc);

    const style = doc.getElementById('enhanced-inline-styles');
    expect(style).not.toBeNull();
    expect(style?.tagName.toLowerCase()).toBe('style');
  });

  it('is idempotent — calling twice does not add a second style element', () => {
    const doc = makeDoc('');
    injectInlineStyles(doc);
    injectInlineStyles(doc);

    const styles = doc.querySelectorAll('#enhanced-inline-styles');
    expect(styles.length).toBe(1);
  });

  it('marks the style element with data-inline-translation for cleanup', () => {
    const doc = makeDoc('');
    injectInlineStyles(doc);

    const style = doc.getElementById('enhanced-inline-styles');
    expect(style?.getAttribute('data-inline-translation')).toBe('1');
  });
});

describe('makeParagraphId', () => {
  it('returns a trimmed, collapsed string', () => {
    const el = document.createElement('p');
    el.textContent = '  Hello   world  ';
    expect(makeParagraphId(el)).toBe('Hello world');
  });

  it('caps at 120 characters', () => {
    const el = document.createElement('p');
    el.textContent = 'a'.repeat(200);
    expect(makeParagraphId(el).length).toBe(120);
  });

  it('returns empty string for empty element', () => {
    const el = document.createElement('p');
    expect(makeParagraphId(el)).toBe('');
  });
});

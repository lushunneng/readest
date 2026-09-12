/**
 * Article Document Builder
 *
 * Constructs ArticleDocument from extracted content
 * Contract Version: 1.0.0
 */

import type { ArticleDocument } from '../../core/models';
import type { ExtractedArticle } from './readability-extractor';
import { createHash } from 'crypto';

/**
 * Generate unique content ID from URL and timestamp
 */
function generateContentId(sourceUrl: string, timestamp: number): string {
  const hash = createHash('md5')
    .update(sourceUrl + timestamp.toString())
    .digest('hex');
  return `article-${hash}`;
}

/**
 * Generate pseudo-CFI for web article
 * Web articles don't have EPUB CFI structure, so we create a stable locator
 */
function generateArticleCFI(contentId: string, paragraphIndex?: number): string {
  const baseLocator = `epubcfi(/6/2[${contentId}]!`;
  if (paragraphIndex !== undefined) {
    return `${baseLocator}/4/2/${paragraphIndex * 2}:0)`;
  }
  return `${baseLocator}/4/2:0)`;
}

/**
 * Generate content version identifier
 */
function generateContentVersion(): string {
  return `v${Date.now()}`;
}

/**
 * Build ArticleDocument from extracted article
 */
export function buildArticleDocument(
  article: ExtractedArticle,
  options: {
    paragraphIndex?: number;
    permissionStatus?: 'granted' | 'prompt' | 'denied';
  } = {},
): ArticleDocument {
  const timestamp = Date.now();
  const contentId = generateContentId(article.sourceUrl, timestamp);
  const cfi = generateArticleCFI(contentId, options.paragraphIndex);
  const contentVersion = generateContentVersion();

  return {
    content_id: contentId,
    source: article.sourceUrl,
    cfi,
    text: article.textContent,
    paragraph_index: options.paragraphIndex,
    section_index: 0, // Web articles are single-section
    content_version: contentVersion,
    permission_status: options.permissionStatus || 'granted',
  };
}

/**
 * Build ArticleDocument from manual paste content
 */
export function buildArticleFromPaste(
  content: string,
  sourceUrl: string,
  options: {
    title?: string;
  } = {},
): ArticleDocument {
  const timestamp = Date.now();
  const contentId = generateContentId(sourceUrl || `paste-${timestamp}`, timestamp);
  const cfi = generateArticleCFI(contentId);
  const contentVersion = generateContentVersion();

  return {
    content_id: contentId,
    source: sourceUrl || `manual-paste-${timestamp}`,
    cfi,
    text: content,
    section_index: 0,
    content_version: contentVersion,
    permission_status: 'granted',
  };
}

/**
 * Build minimal ArticleDocument for link-only fallback
 */
export function buildLinkOnlyDocument(sourceUrl: string): ArticleDocument {
  const timestamp = Date.now();
  const contentId = generateContentId(sourceUrl, timestamp);
  const cfi = generateArticleCFI(contentId);
  const contentVersion = generateContentVersion();

  return {
    content_id: contentId,
    source: sourceUrl,
    cfi,
    text: '', // No content extracted
    section_index: 0,
    content_version: contentVersion,
    permission_status: 'denied', // No content access
  };
}

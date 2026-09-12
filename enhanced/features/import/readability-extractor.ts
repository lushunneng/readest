/**
 * Readability Content Extractor
 *
 * Uses Mozilla Readability to extract article content from web pages
 * Contract Version: 1.0.0
 */

import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

export interface ExtractedArticle {
  title: string;
  content: string;
  textContent: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  length: number;
  sourceUrl: string;
}

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'u',
    'a',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'code',
    'pre',
    'img',
    'figure',
    'figcaption',
    'span',
    'div',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
  RETURN_DOM: false,
};

/**
 * Extract article content using Mozilla Readability
 */
export async function extractArticle(
  htmlContent: string,
  sourceUrl: string,
): Promise<ExtractedArticle | null> {
  try {
    // Parse HTML with JSDOM
    const dom = new JSDOM(htmlContent, {
      url: sourceUrl,
    });

    const document = dom.window.document;

    // Apply Readability
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      return null;
    }

    // Sanitize content with DOMPurify
    const window = dom.window as unknown as Window;
    const purify = DOMPurify(window);
    const cleanContent = purify.sanitize(article.content, DOMPURIFY_CONFIG);

    return {
      title: article.title || 'Untitled Article',
      content: cleanContent,
      textContent: article.textContent,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      excerpt: article.excerpt || undefined,
      length: article.length,
      sourceUrl,
    };
  } catch (error) {
    console.error('Readability extraction failed:', error);
    return null;
  }
}

/**
 * Sanitize user-pasted HTML content
 */
export function sanitizeUserContent(htmlContent: string): string {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const window = dom.window as unknown as Window;
  const purify = DOMPurify(window);

  return purify.sanitize(htmlContent, DOMPURIFY_CONFIG);
}

/**
 * Detect if content is HTML or plain text
 */
export function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

/**
 * Article Import Feature - Public API
 *
 * Orchestrates URL import, content extraction, and library integration
 * Contract Version: 1.0.0
 */

import type { LibraryPort, BookHandle } from '../../core/ports';
import type { ArticleDocument } from '../../core/models';
import { validateUrl, secureFetch } from './url-validator';
import { extractArticle, sanitizeUserContent, isHtmlContent } from './readability-extractor';
import {
  buildArticleDocument,
  buildArticleFromPaste,
  buildLinkOnlyDocument,
} from './article-builder';
import { importArticleToLibrary, checkDuplicateImport } from './library-adapter';

export interface ImportResult {
  success: boolean;
  bookHandle?: BookHandle;
  article?: ArticleDocument;
  error?: string;
  fallbackSuggestion?: 'manual-paste' | 'link-only';
}

export interface ImportOptions {
  /** Use transient import (not persisted to library) */
  transient?: boolean;
  /** Skip duplicate check */
  allowDuplicates?: boolean;
  /** Permission status to set */
  permissionStatus?: 'granted' | 'prompt' | 'denied';
}

/**
 * Import article from URL (Path 1: Automatic extraction)
 */
export async function importFromUrl(
  libraryPort: LibraryPort,
  url: string,
  options: ImportOptions = {},
): Promise<ImportResult> {
  try {
    // Step 1: Validate URL for security
    const validation = await validateUrl(url);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        fallbackSuggestion: 'manual-paste',
      };
    }

    // Step 2: Check for duplicates
    if (!options.allowDuplicates) {
      const duplicate = await checkDuplicateImport(libraryPort, url);
      if (duplicate) {
        return {
          success: true,
          bookHandle: duplicate,
          error: 'Article already imported',
        };
      }
    }

    // Step 3: Fetch content with security constraints
    const { content, contentType } = await secureFetch(url);

    // Step 4: Extract article content with Readability
    const extracted = await extractArticle(content, url);

    if (!extracted) {
      return {
        success: false,
        error: 'Failed to extract article content',
        fallbackSuggestion: 'manual-paste',
      };
    }

    // Step 5: Build ArticleDocument
    const article = buildArticleDocument(extracted, {
      permissionStatus: options.permissionStatus,
    });

    // Step 6: Import to library
    const bookHandle = await importArticleToLibrary(
      libraryPort,
      article,
      {
        title: extracted.title,
        author: extracted.byline,
        siteName: extracted.siteName,
      },
      {
        transient: options.transient,
      },
    );

    return {
      success: true,
      bookHandle: bookHandle || undefined,
      article,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallbackSuggestion: 'manual-paste',
    };
  }
}

/**
 * Import article from manual paste (Path 2: User-driven fallback)
 */
export async function importFromPaste(
  libraryPort: LibraryPort,
  content: string,
  sourceUrl: string,
  options: ImportOptions & { title?: string } = {},
): Promise<ImportResult> {
  try {
    // Sanitize content if HTML
    const cleanContent = isHtmlContent(content) ? sanitizeUserContent(content) : content;

    // Build ArticleDocument
    const article = buildArticleFromPaste(cleanContent, sourceUrl, {
      title: options.title,
    });

    // Import to library
    const bookHandle = await importArticleToLibrary(
      libraryPort,
      article,
      {
        title: options.title || 'Manual Import',
      },
      {
        transient: options.transient,
      },
    );

    return {
      success: true,
      bookHandle: bookHandle || undefined,
      article,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fallbackSuggestion: 'link-only',
    };
  }
}

/**
 * Create link-only bookmark (Path 3: Minimal fallback)
 */
export async function createLinkBookmark(
  libraryPort: LibraryPort,
  url: string,
  options: { title?: string } = {},
): Promise<ImportResult> {
  try {
    const article = buildLinkOnlyDocument(url);

    // Create minimal bookmark entry
    const bookHandle = await importArticleToLibrary(
      libraryPort,
      article,
      {
        title: options.title || url,
      },
      {
        transient: false,
      },
    );

    return {
      success: true,
      bookHandle: bookHandle || undefined,
      article,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Re-export types and utilities
export type { ExtractedArticle } from './readability-extractor';
export type { UrlValidationResult } from './url-validator';
export { validateUrl } from './url-validator';
export { extractArticle } from './readability-extractor';

/**
 * Core Domain Models for Readest Enhanced Features
 *
 * Contract Version: 1.0.0
 * Base Commit: 80f137edaa2cf7393cdf5bbec314051174631d69
 */

/**
 * Represents a document article with positioning and metadata
 *
 * Evidence: decision-draft.md section 2 "接口需求清单"
 */
export interface ArticleDocument {
  /** Unique content identifier (bookHash + CFI) */
  content_id: string;

  /** Source book hash */
  source: string;

  /** CFI locator for precise positioning within the book */
  cfi: string;

  /** Human-readable text content of the article */
  text: string;

  /** Optional paragraph index within the section */
  paragraph_index?: number;

  /** Section index in the book spine */
  section_index: number;

  /** Content version identifier (for cache invalidation) */
  content_version: string;

  /** Permission status for content access */
  permission_status: 'granted' | 'prompt' | 'denied';
}

/**
 * Text selection result from the reader
 *
 * Evidence: access-points.md section 1.2, sel.ts:35-43
 */
export interface TextSelection {
  /** Selected text content */
  text: string;

  /** CFI locator for the selection */
  cfi: string;

  /** Section index where selection occurs */
  index: number;

  /** Page number within current section */
  page: number;
}

/**
 * Book metadata handle returned from import
 *
 * Evidence: access-points.md section 3.2, bookService.ts
 */
export interface BookHandle {
  /** Unique book hash (MD5 of file content) */
  hash: string;

  /** Book title from metadata */
  title: string;

  /** Book author(s) from metadata */
  author: string;

  /** File format: epub, pdf, txt, mobi */
  format: string;

  /** Local file path in library */
  filePath: string;
}

/**
 * Reading progress information
 *
 * Evidence: decision-draft.md section 1.5, view.ts:92-97
 */
export interface ReadingProgress {
  /** Progress percentage (0-100) */
  percent: number;

  /** Current page number in current section */
  currentPage: number;

  /** Total pages in current section */
  totalPages: number;

  /** Current CFI position */
  cfi: string;

  /** Section index */
  section: number;

  /** Estimated time remaining in minutes */
  timeRemaining?: number;
}

/**
 * TTS playback state
 *
 * Evidence: access-points.md section 4.2, TTSController.ts
 */
export interface TTSPlaybackState {
  /** Whether TTS is initialized and active */
  active: boolean;

  /** Whether audio is currently playing */
  playing: boolean;

  /** Current playback rate (0.5 - 2.0) */
  rate?: number;

  /** Current voice identifier */
  voice?: string;
}

/**
 * Location resolution result
 *
 * Evidence: access-points.md section 2.2, view.ts:98
 */
export interface LocationResult {
  /** Section index in book spine */
  index: number;

  /** Text content at the location */
  text: string;

  /** CFI that was resolved */
  cfi: string;
}

/**
 * Structured error for port operations
 *
 * Evidence: decision-draft.md section 2 "强制要求" item 5
 */
export interface PortError {
  /** Error code for programmatic handling */
  code: string;

  /** Human-readable error message */
  message: string;

  /** Original error cause if available */
  cause?: unknown;
}

/**
 * Vocabulary item for learning repository
 *
 * Evidence: Eudic API integration requirement from execution plan
 */
export interface VocabularyItem {
  /** The word or phrase */
  word: string;

  /** Source context (original sentence) */
  context?: string;

  /** CFI location where word was encountered */
  source_cfi?: string;

  /** Book hash where word was encountered */
  source_book?: string;

  /** Timestamp when added */
  added_at: number;
}

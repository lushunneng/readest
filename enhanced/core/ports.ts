/**
 * Core Port Definitions for Readest Enhanced Features
 *
 * Contract Version: 1.0.0
 * Base Commit: 80f137edaa2cf7393cdf5bbec314051174631d69
 *
 * All ports are designed as interface-only contracts. Deployment location
 * and implementation strategy will be determined by workspace-bootstrap agent.
 *
 * Evidence sources documented in contract-index.md
 */

import type {
  TextSelection,
  LocationResult,
  ReadingProgress,
  TTSPlaybackState,
  BookHandle,
  VocabularyItem,
  PortError,
} from './models';

/**
 * Reader Port - Access to reading view and content positioning
 *
 * Evidence:
 * - access-points.md sections 1 (Text Selection) and 2 (CFI Positioning)
 * - decision-draft.md section 1 items 1, 2, 5
 *
 * All methods accept explicit bookHash parameter to support multi-book scenarios.
 * Use getCurrentBookHash() for convenience when operating on active book.
 */
export interface ReaderPort {
  /**
   * Get currently selected text in the reader
   *
   * Evidence: access-points.md section 1, useTextSelector.ts:227,296,353,394
   * Decision: decision-draft.md section 5.2 - Phase 0 only current page extraction
   *
   * @param bookHash - Target book identifier
   * @returns Selected text with CFI locator, or null if no selection
   */
  getTextSelection(bookHash: string): Promise<TextSelection | null>;

  /**
   * Resolve a CFI locator to its content and position
   *
   * Evidence: access-points.md section 2.1, view.ts:98 resolveCFI
   *
   * @param bookHash - Target book identifier
   * @param cfi - EPUB CFI string (e.g., "epubcfi(/6/4!/4/2/8:12)")
   * @returns Location with text content and section index
   * @throws PortError with code CFI_INVALID if CFI cannot be parsed
   * @throws PortError with code BOOK_NOT_FOUND if bookHash is invalid
   */
  resolveLocation(bookHash: string, cfi: string): Promise<LocationResult>;

  /**
   * Get current CFI position in the active view
   *
   * Evidence: access-points.md section 2.1, view.ts:91-92 getCFI
   *
   * @param bookHash - Target book identifier
   * @returns CFI string for current reading position
   */
  getCurrentLocation(bookHash: string): Promise<string>;

  /**
   * Get reading progress for current book
   *
   * Evidence: decision-draft.md section 1.5, view.ts:92-97 getCFIProgress
   *
   * @param bookHash - Target book identifier
   * @returns Progress information including percent, pages, and estimated time
   */
  getReadingProgress(bookHash: string): Promise<ReadingProgress>;

  /**
   * Get the currently active book hash
   *
   * Evidence: decision-draft.md section 5.4 - helper function for multi-book scenarios
   *
   * @returns Current book hash, or null if no book is open
   */
  getCurrentBookHash(): Promise<string | null>;

  /**
   * Navigate to a specific CFI location
   *
   * Evidence: access-points.md section 2.2, view.goTo(index) + resolveCFI
   *
   * @param bookHash - Target book identifier
   * @param cfi - CFI string to navigate to
   * @throws PortError with code CFI_INVALID if CFI cannot be resolved
   */
  goToLocation(bookHash: string, cfi: string): Promise<void>;
}

/**
 * Library Port - Book import and metadata access
 *
 * Evidence:
 * - access-points.md section 3 (Library Import)
 * - decision-draft.md section 1.3
 */
export interface LibraryPort {
  /**
   * Import a book file into Readest library
   *
   * Evidence: access-points.md section 3.1, appService.ts:406-411, bookService.ts:461
   *
   * @param file - File object from file picker, or absolute path string
   * @param options - Import options
   * @returns Book handle with hash and metadata, or null if already exists
   * @throws PortError with code IMPORT_FAILED if file cannot be parsed
   * @throws PortError with code UNSUPPORTED_FORMAT if format is not epub/pdf/txt/mobi
   */
  importBook(file: File | string, options?: ImportBookOptions): Promise<BookHandle | null>;

  /**
   * Get metadata for a book by its hash
   *
   * Evidence: access-points.md section 3.2, Book object structure
   *
   * @param bookHash - Book identifier
   * @returns Book metadata handle
   * @throws PortError with code BOOK_NOT_FOUND if hash is invalid
   */
  getBookMetadata(bookHash: string): Promise<BookHandle>;

  /**
   * List all books in library
   *
   * Evidence: access-points.md section 3, books array parameter
   *
   * @returns Array of all book handles in library
   */
  listBooks(): Promise<BookHandle[]>;
}

/**
 * Import options for LibraryPort.importBook
 *
 * Evidence: access-points.md section 3.1, ImportBookOptions type
 */
export interface ImportBookOptions {
  /**
   * Mark as temporary book (not persisted to library)
   * Used for "Open with" scenarios
   *
   * Evidence: useOpenWithBooks.ts:131 transient: true
   */
  transient?: boolean;

  /**
   * Custom callback for saving book config
   * Optional - uses default persistence if not provided
   */
  saveBookConfig?: (book: BookHandle) => Promise<void>;
}

/**
 * Speech Port - TTS playback control
 *
 * Evidence:
 * - access-points.md section 4 (TTS接入点)
 * - decision-draft.md section 1.4, section 5.3 (Phase 0 playback control only)
 *
 * Phase 0 limitation: Audio stream operations (pitch/speed modification, background music)
 * are not included per decision-draft.md section 5.3. Only playback control is exposed.
 */
export interface SpeechPort {
  /**
   * Initialize TTS for a book section
   *
   * Evidence: access-points.md section 4.2, view.initTTS
   *
   * @param bookHash - Target book identifier
   * @param options - TTS initialization options
   */
  initializeTTS(bookHash: string, options?: TTSOptions): Promise<void>;

  /**
   * Start TTS playback from current position
   *
   * Evidence: access-points.md section 4.1, TTSController.ts:1617,1632 speak/play
   *
   * @param bookHash - Target book identifier
   * @throws PortError with code TTS_ENGINE_UNAVAILABLE if TTS client fails
   */
  startTTS(bookHash: string): Promise<void>;

  /**
   * Pause TTS playback
   *
   * Evidence: access-points.md section 4.1, TTSController.ts:1632 pause
   *
   * @param bookHash - Target book identifier
   */
  pauseTTS(bookHash: string): Promise<void>;

  /**
   * Resume TTS playback
   *
   * Evidence: TTSController pause/resume pattern
   *
   * @param bookHash - Target book identifier
   */
  resumeTTS(bookHash: string): Promise<void>;

  /**
   * Stop TTS playback and reset position
   *
   * Evidence: access-points.md section 4.1, TTSController.ts:1632 stop
   *
   * @param bookHash - Target book identifier
   */
  stopTTS(bookHash: string): Promise<void>;

  /**
   * Get current TTS playback state
   *
   * Evidence: access-points.md section 4.2, eventDispatcher tts-playback-state
   *
   * @param bookHash - Target book identifier
   * @returns Current playback state
   */
  getTTSState(bookHash: string): Promise<TTSPlaybackState>;

  /**
   * Subscribe to TTS state changes
   *
   * Evidence: decision-draft.md section 2 item 4, eventDispatcher.on pattern
   *
   * @param bookHash - Target book identifier
   * @param callback - Called when playback state changes
   * @returns Unsubscribe function
   */
  onTTSStateChange(bookHash: string, callback: (state: TTSPlaybackState) => void): () => void;
}

/**
 * TTS initialization options
 *
 * Evidence: view.initTTS parameters, tts.js:477-479
 */
export interface TTSOptions {
  /**
   * Granularity of TTS segments: 'sentence' or 'paragraph'
   * Default: 'sentence'
   */
  granularity?: 'sentence' | 'paragraph';

  /**
   * Playback rate (0.5 - 2.0)
   * Default: 1.0
   */
  rate?: number;

  /**
   * Voice identifier (platform-specific)
   * Default: system default voice
   */
  voice?: string;
}

/**
 * Learning Repository - Vocabulary and learning data
 *
 * Evidence: Eudic API bridge requirement from execution plan
 *
 * Phase 0 Note: This port is designed for Eudic API integration but requires
 * bridging layer per decision-draft.md section 2. Implementation will be
 * provided by agent-v2-learn.
 */
export interface LearningRepository {
  /**
   * Add a word to vocabulary list
   *
   * @param item - Vocabulary item with word, context, and source location
   * @throws PortError with code EUDIC_API_ERROR if external API fails
   * @throws PortError with code PERMISSION_DENIED if user has not authorized Eudic access
   */
  addVocabulary(item: VocabularyItem): Promise<void>;

  /**
   * Remove a word from vocabulary list
   *
   * @param word - The word to remove
   */
  removeVocabulary(word: string): Promise<void>;

  /**
   * Get all vocabulary items
   *
   * @returns Array of vocabulary items, sorted by added_at descending
   */
  getVocabularyList(): Promise<VocabularyItem[]>;

  /**
   * Check if a word is in vocabulary list
   *
   * @param word - The word to check
   * @returns True if word exists in list
   */
  hasVocabulary(word: string): Promise<boolean>;
}

/**
 * Port error factory for consistent error handling
 *
 * Evidence: decision-draft.md section 2 item 5 - structured error requirement
 */
export function createPortError(code: string, message: string, cause?: unknown): PortError {
  return { code, message, cause };
}

/**
 * Common error codes used across all ports
 *
 * Evidence: decision-draft.md section 2 item 5 error code examples
 */
export const PortErrorCode = {
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
  CFI_INVALID: 'CFI_INVALID',
  TTS_ENGINE_UNAVAILABLE: 'TTS_ENGINE_UNAVAILABLE',
  IMPORT_FAILED: 'IMPORT_FAILED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  EUDIC_API_ERROR: 'EUDIC_API_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

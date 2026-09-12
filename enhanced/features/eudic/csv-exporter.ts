/**
 * CSV export functionality for vocabulary backup and migration
 *
 * Format per v5-report.md section 6.2:
 * - word, definition, context, book_title, added_at
 * - RFC 4180 compliant CSV
 * - UTF-8 with BOM for Excel compatibility
 */

import type { LocalVocabularyItem } from './local-storage';

export interface CsvExportOptions {
  includeHeader?: boolean; // Default: true
  includeDefinition?: boolean; // Default: true
}

/**
 * CSV exporter for vocabulary items
 */
export class VocabularyCsvExporter {
  /**
   * Export vocabulary items to CSV
   */
  static exportToCSV(items: LocalVocabularyItem[], options: CsvExportOptions = {}): Blob {
    const { includeHeader = true, includeDefinition = true } = options;

    const rows: string[][] = [];

    // Header row
    if (includeHeader) {
      const headers = ['word', 'context', 'book_title', 'cfi', 'added_at', 'sync_status'];
      if (includeDefinition) {
        headers.splice(1, 0, 'definition');
      }
      rows.push(headers);
    }

    // Data rows (sorted by added_at descending)
    const sortedItems = [...items].sort((a, b) => b.addedAt - a.addedAt);

    for (const item of sortedItems) {
      const row = [
        item.originalWord,
        item.context || '',
        item.sourceLocation?.bookTitle || '',
        item.sourceLocation?.cfi || '',
        new Date(item.addedAt).toISOString(),
        item.syncStatus,
      ];

      if (includeDefinition) {
        row.splice(1, 0, item.definition || '');
      }

      rows.push(row);
    }

    // Generate CSV with proper escaping
    const csv = rows.map((row) => row.map((cell) => this.escapeCsvCell(cell)).join(',')).join('\n');

    // Add UTF-8 BOM for Excel compatibility
    const bom = '﻿';
    return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  }

  /**
   * Generate filename for CSV export
   */
  static generateFilename(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `readest-vocabulary-${date}.csv`;
  }

  /**
   * Escape CSV cell per RFC 4180
   *
   * Rules:
   * - If cell contains comma, quote, or newline, wrap in quotes
   * - Escape quotes by doubling them
   */
  private static escapeCsvCell(cell: string): string {
    if (!cell) {
      return '""';
    }

    // Check if escaping is needed
    const needsEscaping = /[",\n\r]/.test(cell);

    if (needsEscaping) {
      // Escape quotes by doubling them
      const escaped = cell.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    return `"${cell}"`;
  }

  /**
   * Parse CSV back to items (for import/migration)
   *
   * Note: This is a basic parser for the export format
   * Does not handle all RFC 4180 edge cases
   */
  static parseCSV(csvText: string): Partial<LocalVocabularyItem>[] {
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      return []; // No data rows
    }

    // Skip header (first line)
    const dataLines = lines.slice(1);
    const items: Partial<LocalVocabularyItem>[] = [];

    for (const line of dataLines) {
      const cells = this.parseCsvLine(line);

      if (cells.length < 5) {
        continue; // Invalid row
      }

      const [word, definition, context, bookTitle, cfi, addedAtStr, syncStatus] = cells;

      items.push({
        word: word.toLowerCase().trim(),
        originalWord: word,
        definition: definition || undefined,
        context: context || undefined,
        sourceLocation:
          bookTitle || cfi
            ? {
                bookHash: '', // Will need to be resolved
                bookTitle: bookTitle,
                cfi: cfi,
              }
            : undefined,
        addedAt: new Date(addedAtStr).getTime(),
        syncStatus: (syncStatus as any) || 'unknown',
        retryCount: 0,
      });
    }

    return items;
  }

  /**
   * Parse a single CSV line (basic implementation)
   */
  private static parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of cell
        cells.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // Add last cell
    cells.push(current);

    return cells;
  }
}

/**
 * Sidebar UI - Fixed sidebar showing translation history
 */

import type { TranslationResult } from './translation-controller';

export interface SidebarUIConfig {
  /** Container element to attach sidebar to */
  container: HTMLElement;

  /** CSS class prefix for styling */
  classPrefix?: string;

  /** Maximum history entries to show */
  maxHistoryEntries?: number;

  /** Callback when user clicks on a history entry */
  onHistoryClick?: (result: TranslationResult) => void;

  /** Callback when user clears history */
  onClearHistory?: () => void;
}

export class SidebarUI {
  private element: HTMLElement | null = null;
  private config: SidebarUIConfig;
  private history: TranslationResult[] = [];

  constructor(config: SidebarUIConfig) {
    this.config = {
      classPrefix: 'readest-translate-sidebar',
      maxHistoryEntries: 50,
      ...config,
    };
  }

  /**
   * Initialize and show sidebar
   */
  show(): void {
    if (!this.element) {
      this.element = this.createSidebarElement();
      this.config.container.appendChild(this.element);
    }

    this.element.classList.add(`${this.config.classPrefix}--visible`);
  }

  /**
   * Hide sidebar
   */
  hide(): void {
    if (!this.element) return;
    this.element.classList.remove(`${this.config.classPrefix}--visible`);
  }

  /**
   * Toggle sidebar visibility
   */
  toggle(): void {
    if (!this.element) {
      this.show();
      return;
    }

    if (this.element.classList.contains(`${this.config.classPrefix}--visible`)) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Add translation result to history
   */
  addToHistory(result: TranslationResult): void {
    // Prevent duplicates
    const isDuplicate = this.history.some(
      (entry) => entry.originalText === result.originalText && entry.cfi === result.cfi,
    );

    if (!isDuplicate) {
      this.history.unshift(result);

      // Limit history size
      if (this.history.length > (this.config.maxHistoryEntries || 50)) {
        this.history = this.history.slice(0, this.config.maxHistoryEntries);
      }

      this.updateHistoryList();
    }
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history = [];
    this.updateHistoryList();

    if (this.config.onClearHistory) {
      this.config.onClearHistory();
    }
  }

  /**
   * Get current history
   */
  getHistory(): TranslationResult[] {
    return [...this.history];
  }

  /**
   * Destroy sidebar and cleanup
   */
  destroy(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  /**
   * Create sidebar DOM element
   */
  private createSidebarElement(): HTMLElement {
    const sidebar = document.createElement('div');
    sidebar.className = this.config.classPrefix!;
    sidebar.innerHTML = `
      <div class="${this.config.classPrefix}__header">
        <h3 class="${this.config.classPrefix}__title">Translation History</h3>
        <div class="${this.config.classPrefix}__actions">
          <button class="${this.config.classPrefix}__clear-btn" title="Clear history">Clear</button>
          <button class="${this.config.classPrefix}__close-btn" title="Close">×</button>
        </div>
      </div>
      <div class="${this.config.classPrefix}__body">
        <div class="${this.config.classPrefix}__list"></div>
        <div class="${this.config.classPrefix}__empty">
          <p>No translation history yet.</p>
          <p>Select text to translate.</p>
        </div>
      </div>
    `;

    // Add styles
    this.injectStyles();

    // Setup clear button
    const clearBtn = sidebar.querySelector(
      `.${this.config.classPrefix}__clear-btn`,
    ) as HTMLButtonElement;
    clearBtn.addEventListener('click', () => this.clearHistory());

    // Setup close button
    const closeBtn = sidebar.querySelector(
      `.${this.config.classPrefix}__close-btn`,
    ) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.hide());

    return sidebar;
  }

  /**
   * Update history list display
   */
  private updateHistoryList(): void {
    if (!this.element) return;

    const listEl = this.element.querySelector(`.${this.config.classPrefix}__list`) as HTMLElement;
    const emptyEl = this.element.querySelector(`.${this.config.classPrefix}__empty`) as HTMLElement;

    if (this.history.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'block';
    emptyEl.style.display = 'none';

    listEl.innerHTML = this.history
      .map((result, index) => this.renderHistoryItem(result, index))
      .join('');

    // Setup click handlers
    const items = listEl.querySelectorAll(`.${this.config.classPrefix}__item`);
    items.forEach((item, index) => {
      item.addEventListener('click', () => {
        if (this.config.onHistoryClick) {
          this.config.onHistoryClick(this.history[index]);
        }
      });
    });
  }

  /**
   * Render single history item
   */
  private renderHistoryItem(result: TranslationResult, index: number): string {
    const truncate = (text: string, length: number) =>
      text.length > length ? text.slice(0, length) + '...' : text;

    return `
      <div class="${this.config.classPrefix}__item" data-index="${index}">
        <div class="${this.config.classPrefix}__item-original">
          ${this.escapeHtml(truncate(result.originalText, 100))}
        </div>
        <div class="${this.config.classPrefix}__item-translated">
          ${this.escapeHtml(truncate(result.translatedText, 100))}
        </div>
        <div class="${this.config.classPrefix}__item-meta">
          ${result.sourceLang} → ${result.targetLang}
          ${result.fromCache ? ' • cached' : ''}
        </div>
      </div>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    const styleId = `${this.config.classPrefix}-styles`;

    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .${this.config.classPrefix} {
        position: fixed;
        right: -400px;
        top: 0;
        bottom: 0;
        width: 400px;
        background: white;
        border-left: 1px solid #ddd;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        z-index: 9999;
        transition: right 0.3s ease;
      }

      .${this.config.classPrefix}--visible {
        right: 0;
      }

      .${this.config.classPrefix}__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #eee;
        background: #f9f9f9;
      }

      .${this.config.classPrefix}__title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }

      .${this.config.classPrefix}__actions {
        display: flex;
        gap: 8px;
      }

      .${this.config.classPrefix}__clear-btn,
      .${this.config.classPrefix}__close-btn {
        background: none;
        border: 1px solid #ddd;
        padding: 6px 12px;
        font-size: 12px;
        cursor: pointer;
        border-radius: 4px;
        color: #666;
      }

      .${this.config.classPrefix}__close-btn {
        font-size: 20px;
        padding: 2px 8px;
      }

      .${this.config.classPrefix}__clear-btn:hover,
      .${this.config.classPrefix}__close-btn:hover {
        background: #f0f0f0;
        color: #333;
      }

      .${this.config.classPrefix}__body {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }

      .${this.config.classPrefix}__empty {
        text-align: center;
        color: #999;
        padding: 40px 20px;
      }

      .${this.config.classPrefix}__empty p {
        margin: 8px 0;
      }

      .${this.config.classPrefix}__list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .${this.config.classPrefix}__item {
        padding: 12px;
        background: #f9f9f9;
        border: 1px solid #eee;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .${this.config.classPrefix}__item:hover {
        background: #f0f0f0;
        border-color: #ddd;
      }

      .${this.config.classPrefix}__item-original {
        font-size: 13px;
        color: #666;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px dashed #ddd;
      }

      .${this.config.classPrefix}__item-translated {
        font-size: 14px;
        color: #333;
        margin-bottom: 8px;
      }

      .${this.config.classPrefix}__item-meta {
        font-size: 11px;
        color: #999;
      }

      @media (prefers-color-scheme: dark) {
        .${this.config.classPrefix} {
          background: #2d2d2d;
          border-left-color: #444;
        }

        .${this.config.classPrefix}__header {
          background: #252525;
          border-bottom-color: #444;
        }

        .${this.config.classPrefix}__title {
          color: #eee;
        }

        .${this.config.classPrefix}__clear-btn,
        .${this.config.classPrefix}__close-btn {
          border-color: #444;
          color: #aaa;
        }

        .${this.config.classPrefix}__clear-btn:hover,
        .${this.config.classPrefix}__close-btn:hover {
          background: #3d3d3d;
          color: #eee;
        }

        .${this.config.classPrefix}__item {
          background: #252525;
          border-color: #444;
        }

        .${this.config.classPrefix}__item:hover {
          background: #3d3d3d;
          border-color: #555;
        }

        .${this.config.classPrefix}__item-original {
          color: #aaa;
          border-bottom-color: #444;
        }

        .${this.config.classPrefix}__item-translated {
          color: #eee;
        }
      }

      @media (max-width: 768px) {
        .${this.config.classPrefix} {
          width: 100%;
          right: -100%;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

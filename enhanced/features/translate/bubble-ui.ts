/**
 * Bubble UI - Floating translation bubble shown on text selection
 *
 * Displayed in overlay, NOT injected into foliate iframe (CSP/sandbox restrictions)
 */

import type { TranslationResult } from './translation-controller';

export interface BubbleUIConfig {
  /** Container element to attach bubble to */
  container: HTMLElement;

  /** CSS class prefix for styling */
  classPrefix?: string;

  /** Auto-hide delay in milliseconds */
  autoHideDelay?: number;

  /** Callback when user clicks "Add to vocabulary" */
  onAddVocabulary?: (word: string, context: string) => void;

  /** Callback when bubble is closed */
  onClose?: () => void;
}

export class BubbleUI {
  private element: HTMLElement | null = null;
  private config: BubbleUIConfig;
  private autoHideTimer: number | null = null;

  constructor(config: BubbleUIConfig) {
    this.config = {
      classPrefix: 'readest-translate-bubble',
      autoHideDelay: 0, // No auto-hide by default
      ...config,
    };
  }

  /**
   * Show translation bubble at specified position
   */
  show(params: { result: TranslationResult; position: { x: number; y: number } }): void {
    const { result, position } = params;

    // Create bubble element if not exists
    if (!this.element) {
      this.element = this.createBubbleElement();
      this.config.container.appendChild(this.element);
    }

    // Update content
    this.updateContent(result);

    // Position bubble
    this.positionBubble(position);

    // Show with animation
    this.element.classList.add(`${this.config.classPrefix}--visible`);

    // Setup auto-hide
    if (this.config.autoHideDelay && this.config.autoHideDelay > 0) {
      this.setupAutoHide();
    }

    // Setup click-outside handler
    this.setupClickOutsideHandler();
  }

  /**
   * Hide bubble
   */
  hide(): void {
    if (!this.element) return;

    this.element.classList.remove(`${this.config.classPrefix}--visible`);

    if (this.autoHideTimer) {
      window.clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }

    if (this.config.onClose) {
      this.config.onClose();
    }
  }

  /**
   * Destroy bubble and cleanup
   */
  destroy(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    if (this.autoHideTimer) {
      window.clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  /**
   * Create bubble DOM element
   */
  private createBubbleElement(): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = this.config.classPrefix!;
    bubble.innerHTML = `
      <div class="${this.config.classPrefix}__header">
        <span class="${this.config.classPrefix}__title">Translation</span>
        <button class="${this.config.classPrefix}__close" aria-label="Close">×</button>
      </div>
      <div class="${this.config.classPrefix}__body">
        <div class="${this.config.classPrefix}__original"></div>
        <div class="${this.config.classPrefix}__translated"></div>
      </div>
      <div class="${this.config.classPrefix}__footer">
        <span class="${this.config.classPrefix}__meta"></span>
        <button class="${this.config.classPrefix}__vocab-btn">Add to Vocabulary</button>
      </div>
    `;

    // Add styles
    this.injectStyles();

    // Setup close button
    const closeBtn = bubble.querySelector(
      `.${this.config.classPrefix}__close`,
    ) as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.hide());

    return bubble;
  }

  /**
   * Update bubble content
   */
  private updateContent(result: TranslationResult): void {
    if (!this.element) return;

    const originalEl = this.element.querySelector(
      `.${this.config.classPrefix}__original`,
    ) as HTMLElement;
    const translatedEl = this.element.querySelector(
      `.${this.config.classPrefix}__translated`,
    ) as HTMLElement;
    const metaEl = this.element.querySelector(`.${this.config.classPrefix}__meta`) as HTMLElement;
    const vocabBtn = this.element.querySelector(
      `.${this.config.classPrefix}__vocab-btn`,
    ) as HTMLButtonElement;

    originalEl.textContent = result.originalText;
    translatedEl.textContent = result.translatedText;

    const metaText = result.fromCache
      ? `${result.sourceLang} → ${result.targetLang} (cached)`
      : `${result.sourceLang} → ${result.targetLang}`;
    metaEl.textContent = metaText;

    // Setup vocabulary button
    vocabBtn.onclick = () => {
      if (this.config.onAddVocabulary) {
        this.config.onAddVocabulary(result.originalText, result.originalText);
      }
    };
  }

  /**
   * Position bubble relative to selection
   */
  private positionBubble(position: { x: number; y: number }): void {
    if (!this.element) return;

    const bubble = this.element;
    const containerRect = this.config.container.getBoundingClientRect();

    // Calculate position (above selection by default)
    let top = position.y - bubble.offsetHeight - 10;
    let left = position.x - bubble.offsetWidth / 2;

    // Adjust if overflow
    if (top < containerRect.top) {
      top = position.y + 10; // Show below instead
    }

    if (left < containerRect.left) {
      left = containerRect.left + 10;
    } else if (left + bubble.offsetWidth > containerRect.right) {
      left = containerRect.right - bubble.offsetWidth - 10;
    }

    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
  }

  /**
   * Setup auto-hide timer
   */
  private setupAutoHide(): void {
    if (this.autoHideTimer) {
      window.clearTimeout(this.autoHideTimer);
    }

    this.autoHideTimer = window.setTimeout(() => {
      this.hide();
    }, this.config.autoHideDelay);
  }

  /**
   * Setup click-outside handler
   */
  private setupClickOutsideHandler(): void {
    const handler = (event: MouseEvent) => {
      if (this.element && !this.element.contains(event.target as Node)) {
        this.hide();
        document.removeEventListener('click', handler);
      }
    };

    // Delay to avoid immediate close from the triggering click
    setTimeout(() => {
      document.addEventListener('click', handler);
    }, 100);
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    const styleId = `${this.config.classPrefix}-styles`;

    if (document.getElementById(styleId)) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .${this.config.classPrefix} {
        position: fixed;
        z-index: 10000;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 300px;
        max-width: 400px;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 0.2s, transform 0.2s;
        pointer-events: none;
      }

      .${this.config.classPrefix}--visible {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      .${this.config.classPrefix}__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #eee;
      }

      .${this.config.classPrefix}__title {
        font-weight: 600;
        font-size: 14px;
        color: #333;
      }

      .${this.config.classPrefix}__close {
        background: none;
        border: none;
        font-size: 24px;
        color: #999;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        line-height: 1;
      }

      .${this.config.classPrefix}__close:hover {
        color: #333;
      }

      .${this.config.classPrefix}__body {
        padding: 16px;
      }

      .${this.config.classPrefix}__original {
        font-size: 14px;
        color: #666;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px dashed #ddd;
      }

      .${this.config.classPrefix}__translated {
        font-size: 15px;
        color: #333;
        line-height: 1.6;
      }

      .${this.config.classPrefix}__footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-top: 1px solid #eee;
        background: #f9f9f9;
      }

      .${this.config.classPrefix}__meta {
        font-size: 12px;
        color: #999;
      }

      .${this.config.classPrefix}__vocab-btn {
        padding: 6px 12px;
        font-size: 12px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      .${this.config.classPrefix}__vocab-btn:hover {
        background: #0056b3;
      }

      @media (prefers-color-scheme: dark) {
        .${this.config.classPrefix} {
          background: #2d2d2d;
          border-color: #444;
        }

        .${this.config.classPrefix}__title {
          color: #eee;
        }

        .${this.config.classPrefix}__close {
          color: #999;
        }

        .${this.config.classPrefix}__close:hover {
          color: #eee;
        }

        .${this.config.classPrefix}__original {
          color: #aaa;
          border-bottom-color: #444;
        }

        .${this.config.classPrefix}__translated {
          color: #eee;
        }

        .${this.config.classPrefix}__footer {
          background: #252525;
          border-top-color: #444;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

/**
 * SpeechPort Implementation
 *
 * Adapter bridging enhanced SpeechPort interface to upstream TTS components
 * Contract Version: 1.0.0
 */

import type { SpeechPort, TTSOptions, TTSPlaybackState } from '../../core/ports';
import type { TTSController } from '@/services/tts/TTSController';
import type { AppService } from '@/types/system';
import type { FoliateView } from '@/types/view';
import { createPortError, PortErrorCode } from '../../core/ports';

export class SpeechPortImpl implements SpeechPort {
  #controllers = new Map<string, TTSController>();
  #views = new Map<string, FoliateView>();
  #appService: AppService | null = null;

  constructor(appService?: AppService) {
    this.#appService = appService ?? null;
  }

  async initializeTTS(bookHash: string, options?: TTSOptions): Promise<void> {
    const view = this.#views.get(bookHash);
    if (!view) {
      throw createPortError(PortErrorCode.BOOK_NOT_FOUND, `No view attached for book ${bookHash}`);
    }

    const controller = this.#controllers.get(bookHash);
    if (!controller) {
      throw createPortError(PortErrorCode.TTS_ENGINE_UNAVAILABLE, 'TTS controller not available');
    }

    try {
      // Initialize foliate-js TTS with specified granularity
      await view.initTTS(options?.granularity ?? 'sentence', undefined, undefined);

      // Set voice and rate if specified
      if (options?.voice) {
        await controller.ttsClient.setVoice(options.voice);
      }
      if (options?.rate !== undefined) {
        await controller.ttsClient.setRate(options.rate);
      }
    } catch (error) {
      throw createPortError(
        PortErrorCode.TTS_ENGINE_UNAVAILABLE,
        'TTS initialization failed',
        error,
      );
    }
  }

  async startTTS(bookHash: string): Promise<void> {
    const controller = this.#controllers.get(bookHash);
    if (!controller) {
      throw createPortError(PortErrorCode.TTS_ENGINE_UNAVAILABLE, 'TTS controller not available');
    }

    try {
      await controller.play();
    } catch (error) {
      throw createPortError(
        PortErrorCode.TTS_ENGINE_UNAVAILABLE,
        'Failed to start TTS playback',
        error,
      );
    }
  }

  async pauseTTS(bookHash: string): Promise<void> {
    const controller = this.#controllers.get(bookHash);
    if (!controller) return;

    await controller.pause();
  }

  async resumeTTS(bookHash: string): Promise<void> {
    const controller = this.#controllers.get(bookHash);
    if (!controller) return;

    await controller.play();
  }

  async stopTTS(bookHash: string): Promise<void> {
    const controller = this.#controllers.get(bookHash);
    if (!controller) return;

    await controller.stop();
  }

  async getTTSState(bookHash: string): Promise<TTSPlaybackState> {
    const controller = this.#controllers.get(bookHash);
    if (!controller) {
      return {
        active: false,
        playing: false,
      };
    }

    // Map upstream state to SpeechPort state
    const isPlaying = controller['state'] === 'playing';
    const isActive = controller['state'] !== 'stopped';

    return {
      active: isActive,
      playing: isPlaying,
      rate: controller.ttsRate,
      voice: controller.ttsClient.getVoiceId(),
    };
  }

  onTTSStateChange(bookHash: string, callback: (state: TTSPlaybackState) => void): () => void {
    const controller = this.#controllers.get(bookHash);
    if (!controller) {
      return () => {};
    }

    const handler = () => {
      this.getTTSState(bookHash).then(callback).catch(console.error);
    };

    // Subscribe to upstream events
    controller.addEventListener('tts-playback-state', handler);

    // Return unsubscribe function
    return () => {
      controller.removeEventListener('tts-playback-state', handler);
    };
  }

  /**
   * Register a TTSController for a book
   * @internal Used by integration layer
   */
  registerController(bookHash: string, controller: TTSController, view: FoliateView): void {
    this.#controllers.set(bookHash, controller);
    this.#views.set(bookHash, view);
  }

  /**
   * Unregister a TTSController
   * @internal Used by integration layer
   */
  unregisterController(bookHash: string): void {
    this.#controllers.delete(bookHash);
    this.#views.delete(bookHash);
  }
}

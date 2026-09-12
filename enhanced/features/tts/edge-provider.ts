/**
 * Edge TTS Provider
 *
 * Adapter wrapping upstream EdgeSpeechProvider for enhanced layer
 * Contract Version: 1.0.0
 */

import { EdgeSpeechProvider } from '@/services/tts/providers/edge';
import type { SynthesisProvider, SynthesisRequest, SynthesisResult } from './synthesis-provider';
import { SynthesisPermanentError } from './synthesis-provider';

export class EdgeTTSProvider implements SynthesisProvider {
  readonly id = 'edge-tts';
  readonly label = 'Microsoft Edge TTS';

  #upstreamProvider: EdgeSpeechProvider;
  #initialized = false;

  constructor() {
    this.#upstreamProvider = new EdgeSpeechProvider();
  }

  async initialize(): Promise<boolean> {
    try {
      // Try WebSocket transport first (free)
      const success = await this.#upstreamProvider.init('wss');
      this.#initialized = success;
      return success;
    } catch (error) {
      console.warn('Edge TTS initialization failed:', error);
      this.#initialized = false;
      return false;
    }
  }

  isAvailable(): boolean {
    return this.#initialized;
  }

  getCapabilities() {
    return {
      cacheable: true,
      wordBoundaries: true,
      streaming: false,
    };
  }

  async synthesize(req: SynthesisRequest, signal: AbortSignal): Promise<SynthesisResult> {
    if (!this.#initialized) {
      throw new Error('Edge TTS provider not initialized');
    }

    try {
      const result = await this.#upstreamProvider.synthesize(
        {
          text: req.text,
          lang: req.lang,
          voice: req.voice,
          pitch: req.pitch ?? 1.0,
        },
        signal,
      );

      return {
        audio: result.audio,
        boundaries: result.boundaries,
      };
    } catch (error) {
      // Check if permanent error from upstream
      if (error instanceof Error && error.message === 'No audio data received.') {
        throw new SynthesisPermanentError(error.message, { cause: error });
      }
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Upstream provider has no shutdown method
    this.#initialized = false;
  }
}

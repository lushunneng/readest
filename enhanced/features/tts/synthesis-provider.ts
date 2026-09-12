/**
 * Synthesis Provider Interface
 *
 * Bridge between enhanced SpeechPort and upstream SpeechProvider
 * Contract Version: 1.0.0
 */

import type { TTSWordBoundary } from '@/libs/edgeTTS';

export interface SynthesisRequest {
  text: string;
  lang: string;
  voice: string;
  pitch?: number;
}

export interface SynthesisResult {
  audio: ArrayBuffer;
  boundaries: TTSWordBoundary[];
  durationMs?: number;
}

export interface SynthesisProvider {
  readonly id: string;
  readonly label: string;

  /**
   * Initialize provider (probe availability)
   * @returns true if provider is available
   */
  initialize(): Promise<boolean>;

  /**
   * Synthesize text to audio
   * @param req Synthesis request
   * @param signal Abort signal for cancellation
   * @returns Audio data with word boundaries
   */
  synthesize(req: SynthesisRequest, signal: AbortSignal): Promise<SynthesisResult>;

  /**
   * Check if provider is available
   */
  isAvailable(): boolean;

  /**
   * Get provider capabilities
   */
  getCapabilities(): {
    cacheable: boolean;
    wordBoundaries: boolean;
    streaming: boolean;
  };

  /**
   * Shutdown and release resources
   */
  shutdown(): Promise<void>;
}

/**
 * Permanent synthesis error (skip sentence, don't retry)
 */
export class SynthesisPermanentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SynthesisPermanentError';
  }
}

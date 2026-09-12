/**
 * TTS Feature Module
 *
 * Enhanced TTS synthesis layer with Edge/Kokoro support
 * Contract Version: 1.0.0
 */

export { SynthesisManager } from './synthesis-manager';
export { AudioCache } from './audio-cache';
export { EdgeTTSProvider } from './edge-provider';
export { SpeechPortImpl } from './speech-port-impl';

export type { SynthesisProvider, SynthesisRequest, SynthesisResult } from './synthesis-provider';
export type {
  SynthesisJob,
  TextSegment,
  SynthesisProgress,
  SynthesisState,
} from './synthesis-manager';
export type { CacheEntry, CacheStats } from './audio-cache';

export { SynthesisPermanentError } from './synthesis-provider';

/**
 * Synthesis Manager
 *
 * Manages synthesis state machine, segmentation, and breakpoint recovery
 * Contract Version: 1.0.0
 */

import type { SynthesisProvider, SynthesisRequest } from './synthesis-provider';
import { AudioCache } from './audio-cache';
import { md5 } from 'js-md5';

export type SynthesisState =
  | 'idle'
  | 'synthesizing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface SynthesisJob {
  id: string;
  text: string;
  segments: TextSegment[];
  state: SynthesisState;
  progress: SynthesisProgress;
  error?: string;
}

export interface TextSegment {
  ordinal: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface SynthesisProgress {
  completedSegments: number;
  totalSegments: number;
  bytesGenerated: number;
}

export interface SynthesisManagerOptions {
  provider: SynthesisProvider;
  cache: AudioCache;
  maxSegmentWords?: number;
}

/**
 * Manages synthesis jobs with state machine and breakpoint recovery
 */
export class SynthesisManager {
  #provider: SynthesisProvider;
  #cache: AudioCache;
  #maxSegmentWords: number;
  #jobs = new Map<string, SynthesisJob>();

  constructor(options: SynthesisManagerOptions) {
    this.#provider = options.provider;
    this.#cache = options.cache;
    this.#maxSegmentWords = options.maxSegmentWords ?? 500;
  }

  /**
   * Start synthesis job
   * @param text Full text to synthesize
   * @param req Synthesis parameters
   * @returns Job ID
   */
  async startJob(text: string, req: Omit<SynthesisRequest, 'text'>): Promise<string> {
    const jobId = md5(text + Date.now());
    const segments = this.#segmentText(text);

    const job: SynthesisJob = {
      id: jobId,
      text,
      segments,
      state: 'idle',
      progress: {
        completedSegments: 0,
        totalSegments: segments.length,
        bytesGenerated: 0,
      },
    };

    this.#jobs.set(jobId, job);

    // Start synthesis asynchronously
    this.#synthesizeJob(jobId, req).catch((error) => {
      job.state = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
    });

    return jobId;
  }

  /**
   * Pause synthesis job
   */
  pauseJob(jobId: string): void {
    const job = this.#jobs.get(jobId);
    if (!job || job.state !== 'synthesizing') return;

    job.state = 'paused';
  }

  /**
   * Resume synthesis job
   */
  async resumeJob(jobId: string, req: Omit<SynthesisRequest, 'text'>): Promise<void> {
    const job = this.#jobs.get(jobId);
    if (!job || job.state !== 'paused') return;

    await this.#synthesizeJob(jobId, req);
  }

  /**
   * Cancel synthesis job
   */
  cancelJob(jobId: string): void {
    const job = this.#jobs.get(jobId);
    if (!job) return;

    job.state = 'cancelled';
  }

  /**
   * Get job status
   */
  getJob(jobId: string): SynthesisJob | null {
    return this.#jobs.get(jobId) ?? null;
  }

  /**
   * Remove completed or failed job
   */
  removeJob(jobId: string): void {
    this.#jobs.delete(jobId);
  }

  /**
   * Segment text into manageable chunks
   */
  #segmentText(text: string): TextSegment[] {
    const segments: TextSegment[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentSegment: string[] = [];
    let currentWordCount = 0;
    let startOffset = 0;

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);

      if (currentWordCount + words.length > this.#maxSegmentWords && currentSegment.length > 0) {
        // Flush current segment
        const segmentText = currentSegment.join(' ');
        segments.push({
          ordinal: segments.length,
          text: segmentText,
          startOffset,
          endOffset: startOffset + segmentText.length,
        });

        startOffset += segmentText.length + 1;
        currentSegment = [sentence.trim()];
        currentWordCount = words.length;
      } else {
        currentSegment.push(sentence.trim());
        currentWordCount += words.length;
      }
    }

    // Flush remaining segment
    if (currentSegment.length > 0) {
      const segmentText = currentSegment.join(' ');
      segments.push({
        ordinal: segments.length,
        text: segmentText,
        startOffset,
        endOffset: startOffset + segmentText.length,
      });
    }

    return segments;
  }

  /**
   * Synthesize job segments
   */
  async #synthesizeJob(jobId: string, req: Omit<SynthesisRequest, 'text'>): Promise<void> {
    const job = this.#jobs.get(jobId);
    if (!job) return;

    job.state = 'synthesizing';
    const abortController = new AbortController();

    for (let i = job.progress.completedSegments; i < job.segments.length; i++) {
      // Check for pause/cancel
      if (job.state === 'paused' || job.state === 'cancelled') {
        return;
      }

      const segment = job.segments[i];
      const cacheKey = this.#getCacheKey(segment.text, req);

      // Check cache first
      if (this.#cache.has(cacheKey)) {
        job.progress.completedSegments++;
        continue;
      }

      try {
        // Synthesize segment
        const result = await this.#provider.synthesize(
          {
            text: segment.text,
            lang: req.lang,
            voice: req.voice,
            pitch: req.pitch,
          },
          abortController.signal,
        );

        // Atomic write to cache
        this.#cache.put(cacheKey, result.audio);

        job.progress.completedSegments++;
        job.progress.bytesGenerated += result.audio.byteLength;
      } catch (error) {
        job.state = 'failed';
        job.error = error instanceof Error ? error.message : 'Synthesis failed';
        throw error;
      }
    }

    job.state = 'completed';
  }

  #getCacheKey(text: string, req: Omit<SynthesisRequest, 'text'>): string {
    return md5(JSON.stringify([text, req.lang, req.voice, req.pitch ?? 1.0]));
  }
}

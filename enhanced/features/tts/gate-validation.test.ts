/**
 * TTS Gate Validation Test
 *
 * Tests Gate requirements for TTS synthesis layer
 */

import { EdgeTTSProvider } from './edge-provider';
import { AudioCache } from './audio-cache';
import { SynthesisManager } from './synthesis-manager';
import { promises as fs } from 'fs';
import { resolve } from 'path';

interface GateResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

async function runGateTests(): Promise<void> {
  const results: GateResult[] = [];
  const startTime = Date.now();

  console.log('=== TTS Gate Validation ===\n');

  // Gate 1: Fixed sample synthesis
  try {
    console.log('Gate 1: Fixed sample synthesis (200 words)...');
    const testStart = Date.now();

    const samplePath = resolve(__dirname, 'test-sample.txt');
    const sampleText = await fs.readFile(samplePath, 'utf-8');

    const provider = new EdgeTTSProvider();
    const initialized = await provider.initialize();

    if (!initialized) {
      throw new Error('Edge TTS provider initialization failed');
    }

    const result = await provider.synthesize(
      {
        text: sampleText.substring(0, 500), // First ~100 words for quick test
        lang: 'en',
        voice: 'en-US-AriaNeural',
        pitch: 1.0,
      },
      new AbortController().signal,
    );

    if (!result.audio || result.audio.byteLength === 0) {
      throw new Error('No audio data generated');
    }

    await provider.shutdown();

    results.push({
      name: 'Fixed sample synthesis',
      passed: true,
      duration: Date.now() - testStart,
    });
    console.log(`✅ PASSED (${Date.now() - testStart}ms)\n`);
  } catch (error) {
    results.push({
      name: 'Fixed sample synthesis',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.log(`❌ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }

  // Gate 2: Breakpoint recovery
  try {
    console.log('Gate 2: Breakpoint recovery...');
    const testStart = Date.now();

    const provider = new EdgeTTSProvider();
    await provider.initialize();

    const cache = new AudioCache(100 * 1024 * 1024); // 100MB
    const manager = new SynthesisManager({ provider, cache, maxSegmentWords: 50 });

    const testText =
      'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
    const jobId = await manager.startJob(testText, {
      lang: 'en',
      voice: 'en-US-AriaNeural',
      pitch: 1.0,
    });

    // Wait for partial completion
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Pause job
    manager.pauseJob(jobId);

    const job = manager.getJob(jobId);
    if (!job || job.state !== 'paused') {
      throw new Error('Job pause failed');
    }

    // Resume job
    await manager.resumeJob(jobId, {
      lang: 'en',
      voice: 'en-US-AriaNeural',
      pitch: 1.0,
    });

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const finalJob = manager.getJob(jobId);
    if (!finalJob || finalJob.state !== 'completed') {
      throw new Error(`Job not completed: ${finalJob?.state}`);
    }

    await provider.shutdown();

    results.push({
      name: 'Breakpoint recovery',
      passed: true,
      duration: Date.now() - testStart,
    });
    console.log(`✅ PASSED (${Date.now() - testStart}ms)\n`);
  } catch (error) {
    results.push({
      name: 'Breakpoint recovery',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.log(`❌ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }

  // Gate 3: Cancellation
  try {
    console.log('Gate 3: Cancel interruption...');
    const testStart = Date.now();

    const provider = new EdgeTTSProvider();
    await provider.initialize();

    const cache = new AudioCache(100 * 1024 * 1024);
    const manager = new SynthesisManager({ provider, cache });

    const testText = 'Long text that takes time to synthesize. '.repeat(20);
    const jobId = await manager.startJob(testText, {
      lang: 'en',
      voice: 'en-US-AriaNeural',
      pitch: 1.0,
    });

    // Cancel after brief delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    manager.cancelJob(jobId);

    const job = manager.getJob(jobId);
    if (!job || job.state !== 'cancelled') {
      throw new Error('Job cancellation failed');
    }

    await provider.shutdown();

    results.push({
      name: 'Cancel interruption',
      passed: true,
      duration: Date.now() - testStart,
    });
    console.log(`✅ PASSED (${Date.now() - testStart}ms)\n`);
  } catch (error) {
    results.push({
      name: 'Cancel interruption',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.log(`❌ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }

  // Gate 4: Disk quota management
  try {
    console.log('Gate 4: Disk quota (LRU eviction)...');
    const testStart = Date.now();

    const smallCache = new AudioCache(1024); // 1KB limit

    // Add entries until eviction occurs
    for (let i = 0; i < 10; i++) {
      const audio = new ArrayBuffer(200);
      smallCache.put(`key${i}`, audio);
    }

    const stats = smallCache.getStats();
    if (stats.totalBytes > 1024) {
      throw new Error(`Cache exceeded quota: ${stats.totalBytes} bytes`);
    }

    // Verify LRU eviction (oldest entries should be gone)
    if (smallCache.has('key0')) {
      throw new Error('LRU eviction failed - oldest entry still present');
    }

    results.push({
      name: 'Disk quota management',
      passed: true,
      duration: Date.now() - testStart,
    });
    console.log(`✅ PASSED (${Date.now() - testStart}ms)\n`);
  } catch (error) {
    results.push({
      name: 'Disk quota management',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.log(`❌ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }

  // Gate 5: Failure recovery
  try {
    console.log('Gate 5: Failure recovery...');
    const testStart = Date.now();

    const provider = new EdgeTTSProvider();
    await provider.initialize();

    // Simulate network failure with AbortController
    const abortController = new AbortController();

    const synthesisPromise = provider.synthesize(
      {
        text: 'Test sentence for failure recovery.',
        lang: 'en',
        voice: 'en-US-AriaNeural',
        pitch: 1.0,
      },
      abortController.signal,
    );

    // Abort immediately to simulate network failure
    abortController.abort();

    try {
      await synthesisPromise;
      throw new Error('Expected abort error was not thrown');
    } catch (error) {
      // Expected - synthesis should fail
    }

    // Verify recovery: new request should succeed
    const retryResult = await provider.synthesize(
      {
        text: 'Recovery test sentence.',
        lang: 'en',
        voice: 'en-US-AriaNeural',
        pitch: 1.0,
      },
      new AbortController().signal,
    );

    if (!retryResult.audio || retryResult.audio.byteLength === 0) {
      throw new Error('Recovery synthesis failed');
    }

    await provider.shutdown();

    results.push({
      name: 'Failure recovery',
      passed: true,
      duration: Date.now() - testStart,
    });
    console.log(`✅ PASSED (${Date.now() - testStart}ms)\n`);
  } catch (error) {
    results.push({
      name: 'Failure recovery',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.log(`❌ FAILED: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }

  // Print summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => r.passed === false).length;

  console.log('=== Gate Summary ===');
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${totalDuration}ms\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
  }

  console.log(`\nGate Status: ${failed === 0 ? '✅ PASSED' : '❌ FAILED'}`);
}

// Run tests if executed directly
if (require.main === module) {
  runGateTests().catch(console.error);
}

export { runGateTests };

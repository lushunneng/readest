/**
 * Enhanced Features Bootstrap Module
 *
 * Provides dependency injection, lifecycle management, and feature flags
 * for all Readest enhanced features.
 *
 * Contract Version: 1.0.0
 * Base Commit: 80f137edaa2cf7393cdf5bbec314051174631d69
 */

import type { ReaderPort, LibraryPort, SpeechPort, LearningRepository } from './core/ports';

/**
 * Enhanced features configuration
 */
export interface EnhancedConfig {
  /** Feature flags to control which enhancements are active */
  features?: {
    /** Enable cross-platform import */
    importPlatform?: boolean;
    /** Enable Eudic integration */
    eudic?: boolean;
    /** Enable translation services */
    translate?: boolean;
    /** Enable enhanced TTS */
    tts?: boolean;
  };

  /** Port implementations */
  ports?: {
    reader?: ReaderPort;
    library?: LibraryPort;
    speech?: SpeechPort;
    learning?: LearningRepository;
  };

  /** Optional feature setup hooks supplied by the integration layer. */
  initializers?: Partial<Record<EnhancedFeature, FeatureInitializer>>;
}

export type EnhancedFeature = keyof NonNullable<EnhancedConfig['features']>;
export type FeatureInitializer = (
  registerCleanup: typeof registerCleanup,
) => void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;

/**
 * Enhanced features container
 * Holds registered services and cleanup functions
 */
interface EnhancedContainer {
  ports: {
    reader?: ReaderPort;
    library?: LibraryPort;
    speech?: SpeechPort;
    learning?: LearningRepository;
  };
  cleanup: Array<() => void | Promise<void>>;
  enabledFeatures: ReadonlySet<EnhancedFeature>;
  initialized: boolean;
}

/** Global container instance */
let container: EnhancedContainer | null = null;

/**
 * Initialize enhanced features with provided configuration
 *
 * This function:
 * 1. Registers port implementations in the DI container
 * 2. Initializes enabled features based on feature flags
 * 3. Sets up cleanup handlers for resource management
 *
 * @param config - Configuration with feature flags and port implementations
 * @throws Error if already initialized (call shutdownEnhanced first)
 */
export async function initializeEnhanced(config: EnhancedConfig): Promise<void> {
  if (container?.initialized) {
    throw new Error('Enhanced features already initialized. Call shutdownEnhanced() first.');
  }

  // Create new container
  container = {
    ports: {},
    cleanup: [],
    enabledFeatures: new Set<EnhancedFeature>(),
    initialized: true,
  };

  // Register port implementations
  if (config.ports?.reader) {
    container.ports.reader = config.ports.reader;
  }
  if (config.ports?.library) {
    container.ports.library = config.ports.library;
  }
  if (config.ports?.speech) {
    container.ports.speech = config.ports.speech;
  }
  if (config.ports?.learning) {
    container.ports.learning = config.ports.learning;
  }

  // Initialize features based on flags
  const features = config.features || {};

  // Keep feature state in the container so callers can make decisions without
  // retaining a second, potentially stale configuration object.
  const enabledFeatures = Object.entries(features)
    .filter((entry): entry is [EnhancedFeature, true] => entry[1] === true)
    .map(([name]) => name);
  container.enabledFeatures = new Set(enabledFeatures);

  // Feature modules register their own resources through registerCleanup.
  // Only explicitly enabled features are initialized.
  try {
    for (const feature of enabledFeatures) {
      const initializer = config.initializers?.[feature];
      if (!initializer) continue;
      const cleanup = await initializer(registerCleanup);
      if (cleanup) registerCleanup(cleanup);
    }
  } catch (error) {
    await shutdownEnhanced();
    throw error;
  }
}

/**
 * Shutdown enhanced features and release all resources
 *
 * This function:
 * 1. Calls all registered cleanup handlers
 * 2. Cancels subscriptions
 * 3. Clears timers
 * 4. Resets the container
 *
 * Safe to call multiple times.
 */
export async function shutdownEnhanced(): Promise<void> {
  if (!container) {
    return;
  }

  // Execute all cleanup handlers
  const cleanupHandlers = [...container.cleanup].reverse();
  for (const cleanup of cleanupHandlers) {
    try {
      await cleanup();
    } catch (error) {
      // Log but don't throw - we want to clean up as much as possible
      console.error('Enhanced cleanup error:', error);
    }
  }

  // Reset container
  container = null;
}

/**
 * Check if enhanced features are initialized
 */
export function isEnhancedInitialized(): boolean {
  return container?.initialized || false;
}

/**
 * Get a registered port implementation
 *
 * @param portName - Name of the port to retrieve
 * @returns Port implementation or undefined if not registered
 */
export function getPort<T extends keyof EnhancedContainer['ports']>(
  portName: T,
): EnhancedContainer['ports'][T] | undefined {
  return container?.ports[portName];
}

/**
 * Register a cleanup handler
 *
 * Cleanup handlers are called in reverse order during shutdown.
 *
 * @param cleanup - Function to call during shutdown
 */
export function registerCleanup(cleanup: () => void | Promise<void>): void {
  if (!container) {
    throw new Error('Enhanced features not initialized');
  }
  container.cleanup.push(cleanup);
}

/**
 * Check if a feature is enabled for the current enhanced session.
 *
 * @param featureName - Name of the feature to check
 * @returns true if feature is enabled
 */
export function isFeatureEnabled(featureName: string): boolean {
  return container?.enabledFeatures.has(featureName as EnhancedFeature) ?? false;
}

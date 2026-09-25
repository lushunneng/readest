/**
 * Platform Provider Registry
 *
 * Contract Version: 1.0.0
 * Phase: 0 (Foundation - Interface Design)
 *
 * Central registry for platform providers. Implementations will be added
 * by agent-import-platform in subsequent phases.
 */

import type { PlatformProvider, PlatformCapability, PlatformTier } from './types';

/**
 * Platform registry interface
 *
 * Providers may be backed by the OAuth gateway or a public-content adapter.
 */
export interface PlatformRegistry {
  /**
   * Register a platform provider
   *
   * @param provider - Platform provider implementation
   */
  registerProvider(provider: PlatformProvider): void;

  /**
   * Get a registered provider by platform ID
   *
   * @param platformId - Platform identifier (e.g., 'reddit', 'medium')
   * @returns Provider instance or undefined if not registered
   */
  getProvider(platformId: string): PlatformProvider | undefined;

  /**
   * List all available platforms
   *
   * @param tier - Optional: filter by capability tier (A/B/C)
   * @returns Array of platform capabilities
   */
  listAvailablePlatforms(tier?: PlatformTier): PlatformCapability[];

  /**
   * Check if a platform is registered and available
   *
   * @param platformId - Platform identifier
   * @returns True if platform is registered and status is 'available'
   */
  isPlatformAvailable(platformId: string): boolean;
}

/**
 * In-memory platform registry implementation
 *
 * In-memory registry used by the client bootstrap.
 */
class InMemoryPlatformRegistry implements PlatformRegistry {
  private providers: Map<string, PlatformProvider> = new Map();

  registerProvider(provider: PlatformProvider): void {
    this.providers.set(provider.capability.platform_id, provider);
  }

  getProvider(platformId: string): PlatformProvider | undefined {
    return this.providers.get(platformId);
  }

  listAvailablePlatforms(tier?: PlatformTier): PlatformCapability[] {
    const capabilities = Array.from(this.providers.values())
      .map((p) => p.capability)
      .filter((c) => c.status === 'available');

    if (tier) {
      return capabilities.filter((c) => c.tier === tier);
    }

    return capabilities;
  }

  isPlatformAvailable(platformId: string): boolean {
    const provider = this.providers.get(platformId);
    return provider?.capability.status === 'available';
  }
}

/**
 * Global registry instance
 *
 * Singleton pattern for platform registry access across the application.
 */
let registryInstance: PlatformRegistry | null = null;

/**
 * Get the global platform registry instance
 *
 * @returns Platform registry singleton
 */
export function getPlatformRegistry(): PlatformRegistry {
  if (!registryInstance) {
    registryInstance = new InMemoryPlatformRegistry();
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing purposes)
 */
export function resetPlatformRegistry(): void {
  registryInstance = new InMemoryPlatformRegistry();
}

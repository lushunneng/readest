/**
 * Audio Cache Management
 *
 * LRU cache for synthesized audio with disk quota management
 * Contract Version: 1.0.0
 */

export interface CacheEntry {
  key: string;
  audio: ArrayBuffer;
  timestamp: number;
  sizeBytes: number;
}

export interface CacheStats {
  totalBytes: number;
  entryCount: number;
  hitRate: number;
}

/**
 * LRU audio cache with size-based eviction
 */
export class AudioCache {
  #maxBytes: number;
  #entries = new Map<string, CacheEntry>();
  #totalBytes = 0;
  #hits = 0;
  #misses = 0;

  constructor(maxBytes: number) {
    this.#maxBytes = maxBytes;
  }

  /**
   * Get cached audio
   * @param key Cache key
   * @returns Audio data or null if not found
   */
  get(key: string): ArrayBuffer | null {
    const entry = this.#entries.get(key);
    if (!entry) {
      this.#misses++;
      return null;
    }

    // Update LRU timestamp
    entry.timestamp = Date.now();
    this.#hits++;

    // Return copy (original is retained in cache)
    return entry.audio.slice(0);
  }

  /**
   * Put audio in cache
   * @param key Cache key
   * @param audio Audio data
   */
  put(key: string, audio: ArrayBuffer): void {
    const sizeBytes = audio.byteLength;

    // Check if entry already exists
    const existing = this.#entries.get(key);
    if (existing) {
      // Update existing entry
      this.#totalBytes -= existing.sizeBytes;
      existing.audio = audio.slice(0);
      existing.sizeBytes = sizeBytes;
      existing.timestamp = Date.now();
      this.#totalBytes += sizeBytes;
    } else {
      // Add new entry
      this.#entries.set(key, {
        key,
        audio: audio.slice(0),
        timestamp: Date.now(),
        sizeBytes,
      });
      this.#totalBytes += sizeBytes;
    }

    // Evict if over quota
    this.#evictIfNeeded();
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.#entries.has(key);
  }

  /**
   * Remove entry from cache
   */
  remove(key: string): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;

    this.#entries.delete(key);
    this.#totalBytes -= entry.sizeBytes;
    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.#entries.clear();
    this.#totalBytes = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.#hits + this.#misses;
    return {
      totalBytes: this.#totalBytes,
      entryCount: this.#entries.size,
      hitRate: total > 0 ? this.#hits / total : 0,
    };
  }

  /**
   * Evict LRU entries until under quota
   */
  #evictIfNeeded(): void {
    if (this.#totalBytes <= this.#maxBytes) return;

    // Sort entries by timestamp (oldest first)
    const sorted = Array.from(this.#entries.values()).sort((a, b) => a.timestamp - b.timestamp);

    // Evict oldest until under quota
    for (const entry of sorted) {
      if (this.#totalBytes <= this.#maxBytes) break;

      this.#entries.delete(entry.key);
      this.#totalBytes -= entry.sizeBytes;
    }
  }
}

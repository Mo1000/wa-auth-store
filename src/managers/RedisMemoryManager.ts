import Redis from 'ioredis';
import type { RedisMemoryConfig, SessionAccessMetadata } from '../types/index.js';

interface Logger {
  log: (message: string) => void;
  error: (message: string, error?: unknown) => void;
}

/**
 * Manages Redis memory usage for multi-session credentials
 * Implements LRU (Least Recently Used) eviction strategy
 */
export class RedisMemoryManager {
  private redis: Redis;
  private config: Required<RedisMemoryConfig>;
  private sessionMetadata: Map<string, SessionAccessMetadata> = new Map();
  private metadataKey = '__wa_auth_store:metadata';
  private checkInterval: NodeJS.Timeout | null = null;
  private logger: Logger;

  constructor(redis: Redis, config: RedisMemoryConfig = {}, logger?: Logger) {
    this.redis = redis;
    this.logger = logger || {
      log: () => {},
      error: () => {},
    };
    this.config = {
      maxMemoryBytes: config.maxMemoryBytes ?? 1024 * 1024 * 1024, // 1GB default
      evictionThreshold: config.evictionThreshold ?? 80, // 80% default
      ttlInactivity: config.ttlInactivity ?? 7 * 24 * 60 * 60, // 7 days default
      checkIntervalMs: config.checkIntervalMs ?? 5 * 60 * 1000, // 5 minutes default
    };
  }

  /**
   * Start automatic memory monitoring
   */
  async start(): Promise<void> {
    // Load existing metadata
    await this.loadMetadata();

    // Start periodic checks
    this.checkInterval = setInterval(async () => {
      await this.checkAndEvict();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop memory monitoring
   */
  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    await this.saveMetadata();
  }

  /**
   * Track access to a session (called on every get/set)
   */
  async trackAccess(sessionId: string, estimatedSize: number = 0): Promise<void> {
    const now = Date.now();
    const metadata = this.sessionMetadata.get(sessionId) || {
      sessionId,
      lastAccess: now,
      accessCount: 0,
      estimatedSize: 0,
    };

    metadata.lastAccess = now;
    metadata.accessCount += 1;
    if (estimatedSize > 0) {
      metadata.estimatedSize = estimatedSize;
    }

    this.sessionMetadata.set(sessionId, metadata);
  }

  /**
   * Get current Redis memory usage
   */
  async getMemoryUsage(): Promise<{
    usedBytes: number;
    maxBytes: number;
    percentUsed: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const match = info.match(/used_memory:(\d+)/);
      const usedBytes = match ? parseInt(match[1], 10) : 0;

      return {
        usedBytes,
        maxBytes: this.config.maxMemoryBytes,
        percentUsed: (usedBytes / this.config.maxMemoryBytes) * 100,
      };
    } catch (error) {
      this.logger.error('Failed to get Redis memory info:', error);
      return {
        usedBytes: 0,
        maxBytes: this.config.maxMemoryBytes,
        percentUsed: 0,
      };
    }
  }

  /**
   * Check memory usage and evict if necessary
   */
  async checkAndEvict(): Promise<void> {
    const memory = await this.getMemoryUsage();

    if (memory.percentUsed > this.config.evictionThreshold) {
      await this.evictLRU();
    }

    // Also check for inactive sessions
    await this.evictInactive();
  }

  /**
   * Evict least recently used sessions
   */
  private async evictLRU(): Promise<void> {
    const sortedSessions = Array.from(this.sessionMetadata.values()).sort(
      (a, b) => a.lastAccess - b.lastAccess
    );

    // Evict until we're below threshold
    let evicted = 0;
    for (const metadata of sortedSessions) {
      const memory = await this.getMemoryUsage();
      if (memory.percentUsed <= this.config.evictionThreshold - 10) {
        break;
      }

      await this.evictSession(metadata.sessionId);
      evicted++;
    }

    if (evicted > 0) {
      this.logger.log(`[RedisMemoryManager] Evicted ${evicted} LRU sessions`);
    }
  }

  /**
   * Evict inactive sessions (not accessed for ttlInactivity seconds)
   */
  private async evictInactive(): Promise<void> {
    const now = Date.now();
    const inactiveThreshold = this.config.ttlInactivity * 1000;
    let evicted = 0;

    for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
      if (now - metadata.lastAccess > inactiveThreshold) {
        await this.evictSession(sessionId);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.logger.log(`[RedisMemoryManager] Evicted ${evicted} inactive sessions`);
    }
  }

  /**
   * Evict a specific session from Redis
   */
  private async evictSession(sessionId: string): Promise<void> {
    try {
      const { CREDENTIALS: credsKey, KEYS: keysKey } = this.getRedisKeys(sessionId);

      // Delete from Redis
      await Promise.all([this.redis.del(credsKey), this.redis.del(keysKey)]);

      // Remove from metadata
      this.sessionMetadata.delete(sessionId);

      this.logger.log(`[RedisMemoryManager] Evicted session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to evict session ${sessionId}:`, error);
    }
  }

  /**
   * Get Redis keys for a session
   */
  private getRedisKeys(sessionId: string): { CREDENTIALS: string; KEYS: string } {
    return {
      CREDENTIALS: `wa_creds:${sessionId}`,
      KEYS: `wa_keys:${sessionId}`,
    };
  }

  /**
   * Save metadata to Redis for persistence
   */
  private async saveMetadata(): Promise<void> {
    try {
      const data = Array.from(this.sessionMetadata.values());
      await this.redis.set(this.metadataKey, JSON.stringify(data));
    } catch (error) {
      this.logger.error('Failed to save metadata:', error);
    }
  }

  /**
   * Load metadata from Redis
   */
  private async loadMetadata(): Promise<void> {
    try {
      const data = await this.redis.get(this.metadataKey);
      if (data) {
        const metadata: SessionAccessMetadata[] = JSON.parse(data);
        for (const m of metadata) {
          this.sessionMetadata.set(m.sessionId, m);
        }
      }
    } catch (error) {
      this.logger.error('Failed to load metadata:', error);
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    memoryUsage: {
      usedBytes: number;
      maxBytes: number;
      percentUsed: number;
    };
    totalSessions: number;
    sessionMetadata: SessionAccessMetadata[];
  }> {
    return {
      memoryUsage: await this.getMemoryUsage(),
      totalSessions: this.sessionMetadata.size,
      sessionMetadata: Array.from(this.sessionMetadata.values()),
    };
  }

  /**
   * Clear all tracked metadata
   */
  async clear(): Promise<void> {
    this.sessionMetadata.clear();
    await this.redis.del(this.metadataKey);
  }
}

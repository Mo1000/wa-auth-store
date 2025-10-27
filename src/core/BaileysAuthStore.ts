import type { BaileysCredential, CredentialOptions } from '../types/index.js';
import type { BaileysRedisAdapter } from '../adapters/BaileysRedisAdapter.js';
import type { BaileysOrmAdapter } from '../adapters/BaileysOrmAdapter.js';

/**
 * Main store for managing Baileys credentials with Redis cache and database persistence
 * Mirrors the pattern from useRedisAuthState but as a reusable library
 */
export class BaileysAuthStore {
  private redisAdapter: BaileysRedisAdapter;
  private ormAdapter?: BaileysOrmAdapter;

  constructor(redisAdapter: BaileysRedisAdapter, ormAdapter?: BaileysOrmAdapter) {
    this.redisAdapter = redisAdapter;
    this.ormAdapter = ormAdapter;
  }

  /**
   * Get credentials - prefers Redis, falls back to database
   */
  async getCreds(sessionId: string): Promise<Partial<BaileysCredential> | null> {
    let credential = await this.redisAdapter.getCreds(sessionId);

    if (!credential && this.ormAdapter) {
      credential = await this.ormAdapter.getCreds(sessionId);
      if (credential) {
        // Cache in Redis
        await this.redisAdapter.saveCreds(sessionId, credential);
      }
    }

    return credential;
  }

  /**
   * Save credentials to both Redis and database
   */
  async saveCreds(
    sessionId: string,
    credential: Partial<BaileysCredential>,
    options?: CredentialOptions
  ): Promise<void> {
    await this.redisAdapter.saveCreds(sessionId, credential, options);

    if (options?.syncToDatabase !== false && this.ormAdapter) {
      await this.ormAdapter.saveCreds(sessionId, credential);
    }
  }

  /**
   * Delete credentials from both Redis and database
   */
  async deleteCreds(sessionId: string): Promise<void> {
    await this.redisAdapter.deleteCreds(sessionId);

    if (this.ormAdapter) {
      await this.ormAdapter.deleteCreds(sessionId);
    }
  }

  /**
   * Get specific keys - prefers Redis, falls back to database
   */
  async getKeys(
    sessionId: string,
    type: string,
    ids: string[]
  ): Promise<Record<string, unknown>> {
    let result = await this.redisAdapter.getKeys(sessionId, type, ids);

    const missing = ids.filter((id) => !(id in result));

    if (missing.length > 0 && this.ormAdapter) {
      const dbResult = await this.ormAdapter.getKeys(sessionId, type, missing);

      // Cache missing keys in Redis
      if (Object.keys(dbResult).length > 0) {
        const keysToSet: Record<string, Record<string, unknown>> = {};
        keysToSet[type] = dbResult;
        await this.redisAdapter.setKeys(sessionId, keysToSet);
      }

      result = { ...result, ...dbResult };
    }

    return result;
  }

  /**
   * Set keys in both Redis and database
   */
  async setKeys(
    sessionId: string,
    data: Record<string, Record<string, unknown>>
  ): Promise<void> {
    await this.redisAdapter.setKeys(sessionId, data);

    if (this.ormAdapter) {
      await this.ormAdapter.setKeys(sessionId, data);
    }
  }

  /**
   * Delete specific keys from both Redis and database
   */
  async deleteKeys(sessionId: string, fields: string[]): Promise<void> {
    await this.redisAdapter.deleteKeys(sessionId, fields);

    if (this.ormAdapter) {
      await this.ormAdapter.deleteKeys(sessionId, fields);
    }
  }

  /**
   * Clear all data for a session
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.redisAdapter.clearSession(sessionId);

    if (this.ormAdapter) {
      await this.ormAdapter.clearSession(sessionId);
    }
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    // Note: Redis clear is not implemented to avoid clearing unrelated data
    // Only clear database
    if (this.ormAdapter) {
      await this.ormAdapter.clearAll();
    }
  }

  /**
   * Sync all Redis data to database
   */
  async syncRedisToDatabase(): Promise<void> {
    if (!this.ormAdapter) {
      throw new Error('ORM adapter is not configured');
    }

    // This is a placeholder for syncing all Redis data to database
    // Implementation depends on specific use case
  }
}

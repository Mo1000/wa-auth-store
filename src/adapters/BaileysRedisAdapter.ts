import Redis from 'ioredis';
import type { BaileysCredential, CredentialOptions } from '../types/index.js';
import { getRedisKeyWhatsapp } from '../utils/index.js';
import { BufferJSON } from '@whiskeysockets/baileys';

/**
 * Redis adapter for storing Baileys credentials
 * Optimized for WhatsApp session management
 */
export class BaileysRedisAdapter {
  private redis: Redis;

  constructor(redisUrl: string = 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl);
  }

  async connect(): Promise<void> {
    await this.redis.ping();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Save credentials to Redis
   */
  async saveCreds(
    sessionId: string,
    credential: Partial<BaileysCredential>,
    options?: CredentialOptions
  ): Promise<void> {
    const { CREDENTIALS: credsKey, KEYS: keysKey } = getRedisKeyWhatsapp(sessionId);

    if (credential.creds) {
      const credsData = JSON.stringify(credential.creds, BufferJSON.replacer);
      const ttl = options?.ttl;

      if (ttl) {
        await this.redis.setex(credsKey, ttl, credsData);
      } else {
        await this.redis.set(credsKey, credsData);
      }
    }

    if (credential.keys) {
      const keysData = Object.entries(credential.keys).map(([field, value]) => [
        field,
        JSON.stringify(value, BufferJSON.replacer),
      ]);

      if (keysData.length > 0) {
        const ttl = options?.ttl;
        const keysObj = Object.fromEntries(keysData);

        if (ttl) {
          await this.redis.hset(keysKey, keysObj);
          await this.redis.expire(keysKey, ttl);
        } else {
          await this.redis.hset(keysKey, keysObj);
        }
      }
    }
  }

  /**
   * Get credentials from Redis
   */
  async getCreds(sessionId: string): Promise<Partial<BaileysCredential> | null> {
    const { CREDENTIALS: credsKey, KEYS: keysKey } = getRedisKeyWhatsapp(sessionId);

    const credsData = await this.redis.get(credsKey);
    const keysData = await this.redis.hgetall(keysKey);

    if (!credsData && Object.keys(keysData).length === 0) {
      return null;
    }

    const credential: Partial<BaileysCredential> = {};

    if (credsData) {
      credential.creds = JSON.parse(credsData, BufferJSON.reviver);
    }

    if (Object.keys(keysData).length > 0) {
      credential.keys = {};
      for (const [field, value] of Object.entries(keysData)) {
        credential.keys[field] = JSON.parse(value, BufferJSON.reviver);
      }
    }

    return credential;
  }

  /**
   * Delete credentials from Redis
   */
  async deleteCreds(sessionId: string): Promise<void> {
    const { CREDENTIALS: credsKey, KEYS: keysKey } = getRedisKeyWhatsapp(sessionId);

    await this.redis.del(credsKey, keysKey);
  }

  /**
   * Get specific keys from Redis
   */
  async getKeys(sessionId: string, type: string, ids: string[]): Promise<Record<string, unknown>> {
    const { KEYS: keysKey } = getRedisKeyWhatsapp(sessionId);
    const result: Record<string, unknown> = {};

    if (ids.length === 0) return result;

    const fields = ids.map((id) => `${type}-${id}`);
    const values = await this.redis.hmget(keysKey, ...fields);

    ids.forEach((id, i) => {
      const value = values[i];
      if (value && typeof value === 'string') {
        result[id] = JSON.parse(value, BufferJSON.reviver);
      }
    });

    return result;
  }

  /**
   * Set specific keys in Redis
   */
  async setKeys(
    sessionId: string,
    data: Record<string, Record<string, unknown>>,
    options?: { ttl?: number }
  ): Promise<void> {
    const { KEYS: keysKey } = getRedisKeyWhatsapp(sessionId);
    const ops: Record<string, string> = {};

    for (const category in data) {
      for (const id in data[category]) {
        const value = data[category][id];
        const field = `${category}-${id}`;
        if (value) {
          ops[field] = JSON.stringify(value);
        } else {
          await this.redis.hdel(keysKey, field);
        }
      }
    }

    if (Object.keys(ops).length > 0) {
      await this.redis.hset(keysKey, ops);

      // Set TTL if provided
      if (options?.ttl) {
        await this.redis.expire(keysKey, options.ttl);
      }
    }
  }

  /**
   * Delete specific keys from Redis
   */
  async deleteKeys(sessionId: string, fields: string[]): Promise<void> {
    const { KEYS: keysKey } = getRedisKeyWhatsapp(sessionId);
    if (fields.length > 0) {
      await this.redis.hdel(keysKey, ...fields);
    }
  }

  /**
   * Clear all credentials for a session
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.deleteCreds(sessionId);
  }
}

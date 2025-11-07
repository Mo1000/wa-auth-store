import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { proto, BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import type { BaileysAuthStore } from '../core/BaileysAuthStore';
import type { RedisMemoryConfig } from '../types/index.js';
import { RedisMemoryManager } from '../managers/RedisMemoryManager.js';
import type Redis from 'ioredis';

export interface UseBaileysAuthStateOptions {
  ttl?: number; // TTL in seconds for Redis
  syncToDatabase?: boolean; // Sync to database (default: true)
  redisMemoryConfig?: RedisMemoryConfig; // Redis memory management config
  redis?: Redis; // Redis client for memory management (required if redisMemoryConfig is provided)
}

export interface UseBaileysAuthStateReturn {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  memoryManager?: RedisMemoryManager; // Memory manager instance if configured
}

/**
 * Create a complete Baileys authentication state with Redis caching and database persistence
 *
 * This helper handles all the complexity of managing credentials and keys,
 * so you can just pass the state directly to Baileys without worrying about storage.
 *
 * Optionally enables automatic Redis memory management with LRU eviction of unused sessions.
 *
 * @param authStore - BaileysAuthStore instance
 * @param sessionId - Session identifier
 * @param options - Optional configuration
 * @returns Object with state, saveCreds function, and optional memoryManager ready for Baileys
 *
 * @example
 * ```typescript
 * // Basic usage without memory management
 * const { state, saveCreds } = await useBaileysAuthState(authStore, 'session-123');
 *
 * // With automatic Redis memory management
 * const { state, saveCreds, memoryManager } = await useBaileysAuthState(authStore, 'session-123', {
 *   redisMemoryConfig: {
 *     maxMemoryBytes: 1024 * 1024 * 1024, // 1GB limit
 *     evictionThreshold: 80, // Evict when 80% full
 *     ttlInactivity: 7 * 24 * 60 * 60, // Delete unused sessions after 7 days
 *     checkIntervalMs: 5 * 60 * 1000, // Check every 5 minutes
 *   },
 *   redis: redisClient,
 * });
 *
 * const { socket, state: baileysState } = makeWASocket({
 *   auth: state,
 *   // ... other options
 * });
 *
 * // Save credentials whenever Baileys updates them
 * socket.ev.on('creds.update', async () => {
 *   await saveCreds();
 * });
 *
 * // Cleanup on shutdown
 * process.on('SIGINT', async () => {
 *   if (memoryManager) {
 *     await memoryManager.stop();
 *   }
 * });
 * ```
 */
export async function useBaileysAuthState(
  authStore: BaileysAuthStore,
  sessionId: string,
  options?: UseBaileysAuthStateOptions
): Promise<UseBaileysAuthStateReturn> {
  // Initialize memory manager if configured
  let memoryManager: RedisMemoryManager | undefined;
  if (options?.redisMemoryConfig && options?.redis) {
    memoryManager = new RedisMemoryManager(options.redis, options.redisMemoryConfig);
    await memoryManager.start();
  }

  // Load existing credentials or initialize new ones
  const getCreds = async () => {
    const credential = await authStore.getCreds(sessionId);
    if (credential?.creds) {
      // Track access for memory management
      if (memoryManager) {
        await memoryManager.trackAccess(sessionId);
      }
      return credential.creds;
    }
    return initAuthCreds();
  };

  const creds = await getCreds();

  /**
   * Save credentials to both Redis and database
   */
  const saveCreds = async () => {
    await authStore.saveCreds(
      sessionId,
      {
        creds,
      },
      {
        ttl: options?.ttl,
        syncToDatabase: options?.syncToDatabase !== false,
      }
    );

    // Track access for memory management
    if (memoryManager) {
      await memoryManager.trackAccess(sessionId);
    }
  };

  /**
   * Authentication state with get/set for keys
   */
  const state: AuthenticationState = {
    creds: creds as AuthenticationState['creds'],
    keys: {
      /**
       * Get multiple keys from Redis (with database fallback)
       */
      get: async (type, ids) => {
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};

        if (!ids.length) return result;

        // Get keys from store (Redis first, then database)
        const keysData = await authStore.getKeys(sessionId, type, ids);

        // Track access for memory management
        if (memoryManager) {
          await memoryManager.trackAccess(sessionId);
        }

        // Parse and convert keys
        for (const id of ids) {
          const value = keysData[id];
          if (value) {
            // Special handling for app-state-sync-key
            if (type === 'app-state-sync-key') {
              result[id] = proto.Message.AppStateSyncKeyData.create(
                value
              ) as unknown as SignalDataTypeMap[typeof type];
            } else {
              result[id] = value as SignalDataTypeMap[typeof type];
            }
          }
        }

        return result;
      },

      /**
       * Set multiple keys in Redis and database
       */
      set: async (data) => {
        // Transform data for storage
        const keysToStore: Record<string, Record<string, unknown>> = {};

        for (const category in data) {
          keysToStore[category] = {};

          for (const id in data[category as keyof SignalDataTypeMap]) {
            const value = data[category as keyof SignalDataTypeMap]?.[id];

            if (value) {
              // Serialize with BufferJSON for proper Buffer handling
              keysToStore[category][id] = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
            }
          }
        }

        // Save to both Redis and database with same TTL as credentials
        await authStore.setKeys(sessionId, keysToStore, {
          ttl: options?.ttl,
        });

        // Track access for memory management
        if (memoryManager) {
          await memoryManager.trackAccess(sessionId);
        }
      },
    },
  };

  return {
    state,
    saveCreds,
    memoryManager,
  };
}

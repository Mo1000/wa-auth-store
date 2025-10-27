import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { initAuthCreds } from '@whiskeysockets/baileys/lib/Utils/auth-utils.js';
import { BufferJSON } from '@whiskeysockets/baileys/lib/Utils/generics.js';
import { proto } from '@whiskeysockets/baileys/WAProto/index.js';
import type { BaileysAuthStore } from '../core/BaileysAuthStore';

export interface UseBaileysAuthStateOptions {
  ttl?: number; // TTL in seconds for Redis
  syncToDatabase?: boolean; // Sync to database (default: true)
}

export interface UseBaileysAuthStateReturn {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/**
 * Create a complete Baileys authentication state with Redis caching and database persistence
 *
 * This helper handles all the complexity of managing credentials and keys,
 * so you can just pass the state directly to Baileys without worrying about storage.
 *
 * @param authStore - BaileysAuthStore instance
 * @param sessionId - Session identifier
 * @param options - Optional configuration
 * @returns Object with state and saveCreds function ready for Baileys
 *
 * @example
 * ```typescript
 * const { state, saveCreds } = await useBaileysAuthState(authStore, 'session-123');
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
 * ```
 */
export async function useBaileysAuthState(
  authStore: BaileysAuthStore,
  sessionId: string,
  options?: UseBaileysAuthStateOptions
): Promise<UseBaileysAuthStateReturn> {
  // Load existing credentials or initialize new ones
  const getCreds = async () => {
    const credential = await authStore.getCreds(sessionId);
    if (credential?.creds) {
      return credential.creds as any;
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
  };

  /**
   * Authentication state with get/set for keys
   */
  const state: AuthenticationState = {
    creds,
    keys: {
      /**
       * Get multiple keys from Redis (with database fallback)
       */
      get: async (type, ids) => {
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};

        if (!ids.length) return result;

        // Get keys from store (Redis first, then database)
        const keysData = await authStore.getKeys(sessionId, type, ids);

        // Parse and convert keys
        for (const id of ids) {
          const value = keysData[id];
          if (value) {
            let parsed: any = value;

            // Special handling for app-state-sync-key
            if (type === 'app-state-sync-key') {
              parsed = proto.Message.AppStateSyncKeyData.create(value as any);
            }

            result[id] = parsed;
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

        // Save to both Redis and database
        await authStore.setKeys(sessionId, keysToStore);
      },
    },
  };

  return {
    state,
    saveCreds,
  };
}

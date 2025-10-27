import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BaileysCredential } from '../types/index.js';

// Mock adapters for testing
class MockBaileysRedisAdapter {
  private store: Map<string, Partial<BaileysCredential>> = new Map();

  async connect(): Promise<void> {
    // no-op
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async saveCreds(
    sessionId: string,
    credential: Partial<BaileysCredential>
  ): Promise<void> {
    this.store.set(sessionId, credential);
  }

  async getCreds(sessionId: string): Promise<Partial<BaileysCredential> | null> {
    return this.store.get(sessionId) || null;
  }

  async deleteCreds(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async getKeys(
    sessionId: string,
    type: string,
    ids: string[]
  ): Promise<Record<string, unknown>> {
    const credential = this.store.get(sessionId);
    if (!credential?.keys) return {};

    const result: Record<string, unknown> = {};
    for (const id of ids) {
      const field = `${type}-${id}`;
      const value = (credential.keys as Record<string, unknown>)[field];
      if (value) {
        result[id] = value;
      }
    }
    return result;
  }

  async setKeys(
    sessionId: string,
    data: Record<string, Record<string, unknown>>
  ): Promise<void> {
    const credential = this.store.get(sessionId) || {};
    const currentKeys = { ...(credential.keys ?? {}) };

    for (const category in data) {
      for (const id in data[category]) {
        const value = data[category][id];
        const field = `${category}-${id}`;
        if (value) {
          currentKeys[field] = value;
        }
      }
    }

    credential.keys = currentKeys;
    this.store.set(sessionId, credential);
  }

  async deleteKeys(sessionId: string, fields: string[]): Promise<void> {
    const credential = this.store.get(sessionId);
    if (credential?.keys) {
      const keys = credential.keys as Record<string, unknown>;
      for (const field of fields) {
        delete keys[field];
      }
    }
  }

  async clearSession(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}

describe('BaileysAuthStore', () => {
  let redisAdapter: MockBaileysRedisAdapter;

  beforeEach(() => {
    redisAdapter = new MockBaileysRedisAdapter();
  });

  afterEach(async () => {
    await redisAdapter.disconnect();
  });

  it('should save and retrieve credentials', async () => {
    const sessionId = 'session-123';
    const credential: Partial<BaileysCredential> = {
      creds: { test: 'data' },
      keys: { 'pre-key-1': { value: 'test' } },
    };

    await redisAdapter.saveCreds(sessionId, credential);
    const retrieved = await redisAdapter.getCreds(sessionId);

    expect(retrieved).toEqual(credential);
  });

  it('should retrieve specific keys', async () => {
    const sessionId = 'session-123';
    const credential: Partial<BaileysCredential> = {
      keys: {
        'app-state-sync-key-1': { value: 'key1' },
        'app-state-sync-key-2': { value: 'key2' },
        'pre-key-1': { value: 'prekey1' },
      },
    };

    await redisAdapter.saveCreds(sessionId, credential);
    const keys = await redisAdapter.getKeys(sessionId, 'app-state-sync-key', [
      '1',
      '2',
    ]);

    expect(keys).toEqual({
      '1': { value: 'key1' },
      '2': { value: 'key2' },
    });
  });

  it('should set keys', async () => {
    const sessionId = 'session-123';

    await redisAdapter.setKeys(sessionId, {
      'app-state-sync-key': {
        '1': { value: 'key1' },
        '2': { value: 'key2' },
      },
    });

    const credential = await redisAdapter.getCreds(sessionId);
    expect(credential?.keys).toEqual({
      'app-state-sync-key-1': { value: 'key1' },
      'app-state-sync-key-2': { value: 'key2' },
    });
  });

  it('should delete credentials', async () => {
    const sessionId = 'session-123';
    const credential: Partial<BaileysCredential> = {
      creds: { test: 'data' },
    };

    await redisAdapter.saveCreds(sessionId, credential);
    await redisAdapter.deleteCreds(sessionId);

    const retrieved = await redisAdapter.getCreds(sessionId);
    expect(retrieved).toBeNull();
  });

  it('should clear session', async () => {
    const sessionId = 'session-123';
    const credential: Partial<BaileysCredential> = {
      creds: { test: 'data' },
      keys: { 'pre-key-1': { value: 'test' } },
    };

    await redisAdapter.saveCreds(sessionId, credential);
    await redisAdapter.clearSession(sessionId);

    const retrieved = await redisAdapter.getCreds(sessionId);
    expect(retrieved).toBeNull();
  });

  it('should handle multiple sessions independently', async () => {
    const session1: Partial<BaileysCredential> = {
      creds: { session: '1' },
    };
    const session2: Partial<BaileysCredential> = {
      creds: { session: '2' },
    };

    await redisAdapter.saveCreds('session-1', session1);
    await redisAdapter.saveCreds('session-2', session2);

    const retrieved1 = await redisAdapter.getCreds('session-1');
    const retrieved2 = await redisAdapter.getCreds('session-2');

    expect(retrieved1?.creds).toEqual({ session: '1' });
    expect(retrieved2?.creds).toEqual({ session: '2' });
  });
});

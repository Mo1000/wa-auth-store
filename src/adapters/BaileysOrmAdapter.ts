import type { EntityManager } from '@mikro-orm/core';
import type { BaileysCredential } from '../types/index.js';
import { BufferJSON } from '@whiskeysockets/baileys';

interface CredentialEntity {
  sessionId: string;
  creds?: unknown;
  keys?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Base class for ORM-based Baileys credential storage
 * Supports MikroORM with PostgreSQL, MySQL, SQLite, etc.
 */
export class BaileysOrmAdapter {
  protected em: EntityManager;
  protected entityClass: new (...args: unknown[]) => CredentialEntity;

  constructor(em: EntityManager, entityClass: new (...args: unknown[]) => CredentialEntity) {
    this.em = em;
    this.entityClass = entityClass;
  }

  /**
   * Save credentials to database
   */
  async saveCreds(sessionId: string, credential: Partial<BaileysCredential>): Promise<void> {
    const em = this.em.fork();

    let row = (await em.findOne(this.entityClass, { sessionId })) as CredentialEntity | null;

    if (!row) {
      row = em.create(this.entityClass, { sessionId }) as CredentialEntity;
    }

    if (credential.creds !== undefined) {
      row.creds = JSON.parse(JSON.stringify(credential.creds, BufferJSON.replacer));
    }

    if (credential.keys !== undefined) {
      row.keys = JSON.parse(JSON.stringify(credential.keys, BufferJSON.replacer));
    }

    await em.persistAndFlush(row);
  }

  /**
   * Get credentials from database
   */
  async getCreds(sessionId: string): Promise<Partial<BaileysCredential> | null> {
    const em = this.em.fork();
    const row = (await em.findOne(this.entityClass, { sessionId })) as CredentialEntity | null;

    if (!row) {
      return null;
    }

    return {
      sessionId,
      creds: row.creds,
      keys: row.keys,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Delete credentials from database
   */
  async deleteCreds(sessionId: string): Promise<void> {
    const em = this.em.fork();
    const row = (await em.findOne(this.entityClass, { sessionId })) as CredentialEntity | null;

    if (row) {
      await em.removeAndFlush(row);
    }
  }

  /**
   * Get specific keys from database
   */
  async getKeys(sessionId: string, type: string, ids: string[]): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const row = (await em.findOne(this.entityClass, { sessionId })) as CredentialEntity | null;

    if (!row || !row.keys) {
      return {};
    }

    const result: Record<string, unknown> = {};

    for (const id of ids) {
      const field = `${type}-${id}`;
      const value = row.keys[field];
      if (value) {
        result[id] = value;
      }
    }

    return result;
  }

  /**
   * Set specific keys in database
   */
  async setKeys(sessionId: string, data: Record<string, Record<string, unknown>>): Promise<void> {
    const em = this.em.fork();

    let row = (await em.findOne(this.entityClass, { sessionId })) as CredentialEntity | null;

    if (!row) {
      row = em.create(this.entityClass, { sessionId }) as CredentialEntity;
    }

    const currentKeys: Record<string, unknown> = { ...(row.keys ?? {}) };

    for (const category in data) {
      for (const id in data[category]) {
        const value = data[category][id];
        const field = `${category}-${id}`;

        if (value) {
          currentKeys[field] = value;
        } else {
          delete currentKeys[field];
        }
      }
    }

    row.keys = currentKeys;
    await em.persistAndFlush(row);
  }

  /**
   * Delete specific keys from database
   */
  async deleteKeys(sessionId: string, fields: string[]): Promise<void> {
    const em = this.em.fork();
    const row = (await em.findOne(this.entityClass, { sessionId })) as CredentialEntity | null;

    if (row && row.keys) {
      const keys = row.keys;
      for (const field of fields) {
        delete keys[field];
      }
      row.keys = keys;
      await em.persistAndFlush(row);
    }
  }

  /**
   * Clear all credentials for a session
   */
  async clearSession(sessionId: string): Promise<void> {
    await this.deleteCreds(sessionId);
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    const em = this.em.fork();
    await em.nativeDelete(this.entityClass, {});
  }
}

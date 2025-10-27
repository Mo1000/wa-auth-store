// Baileys-specific exports
export { BaileysAuthStore } from './core/BaileysAuthStore.js';
export { BaileysRedisAdapter } from './adapters/BaileysRedisAdapter.js';
export { BaileysOrmAdapter } from './adapters/BaileysOrmAdapter.js';
export { useBaileysAuthState } from './helpers/baileys.js';

// Memory management exports
export { RedisMemoryManager } from './managers/RedisMemoryManager.js';

// Type exports
export type { BaileysCredential, CredentialOptions, GenericCredential, RedisMemoryConfig, SessionAccessMetadata } from './types/index.js';
export type { UseBaileysAuthStateOptions, UseBaileysAuthStateReturn } from './helpers/baileys.js';

// Utility exports
export { getRedisKeyWhatsapp } from './utils/index.js';

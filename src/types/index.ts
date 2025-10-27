/**
 * Represents Baileys authentication credentials
 */
export interface BaileysCredential {
  sessionId: string;
  creds?: unknown; // AuthenticationCreds serialized
  keys?: Record<string, unknown>; // SignalDataTypeMap entries
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Options for saving credentials
 */
export interface CredentialOptions {
  syncToDatabase?: boolean;
  ttl?: number; // TTL in seconds for Redis
}

/**
 * Generic credential for non-Baileys use cases
 */
export interface GenericCredential {
  id: string;
  userId: string;
  type: 'token' | 'session' | 'api_key' | 'custom';
  value: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Redis memory management configuration
 */
export interface RedisMemoryConfig {
  maxMemoryBytes?: number; // Max memory in bytes (default: 1GB)
  evictionThreshold?: number; // Trigger eviction at % of max (default: 80)
  ttlInactivity?: number; // Delete if unused for X seconds (default: 7 days)
  checkIntervalMs?: number; // Check memory usage interval (default: 5 minutes)
}

/**
 * Session access metadata for LRU tracking
 */
export interface SessionAccessMetadata {
  sessionId: string;
  lastAccess: number; // Unix timestamp
  accessCount: number;
  estimatedSize: number; // Bytes
}

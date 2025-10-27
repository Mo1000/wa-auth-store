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

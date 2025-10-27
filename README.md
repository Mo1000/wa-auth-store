# wa-auth-store

A TypeScript library for managing and synchronizing WhatsApp Baileys credentials between Redis (cache/in-memory store) and a persistent database using MikroORM.

Inspired by the `useRedisAuthState` pattern, this library provides a reusable, production-ready solution for storing Baileys authentication state with both fast Redis caching and database persistence.

## Features

- **Fast Access**: Store Baileys credentials in Redis for quick retrieval
- **Persistent Storage**: Sync credentials to a database (PostgreSQL, MySQL, SQLite, etc.) via MikroORM
- **Hybrid Approach**: Prefer Redis, fall back to database, automatic cache warming
- **Baileys-Optimized**: Handle both `creds` and `keys` (SignalDataTypeMap) efficiently
- **Type-Safe**: Full TypeScript support with strict type checking
- **TTL Support**: Automatic expiration of credentials in Redis
- **Redis Memory Management**: Automatic LRU (Least Recently Used) eviction with configurable limits to prevent memory overflow
- **Extensible**: Easy to add support for other ORM adapters or databases

## Installation

### Default Installation

```bash
npm install wa-auth-store
```

This automatically installs:

- `ioredis` - Redis client
- `@mikro-orm/core` - ORM framework

### Optional: Choose Your Database Driver

By default, no specific database driver is installed. Choose one based on your database:

**For PostgreSQL:**

```bash
npm install @mikro-orm/postgresql
```

**For MySQL:**

```bash
npm install @mikro-orm/mysql
```

**For SQLite:**

```bash
npm install @mikro-orm/sqlite
```

### Summary

| Package                 | Installed | Why                         |
| ----------------------- | --------- | --------------------------- |
| `wa-auth-store`         | Auto      | The library itself          |
| `ioredis`               | Auto      | Redis operations (required) |
| `@mikro-orm/core`       | Auto      | Database ORM (required)     |
| `@mikro-orm/postgresql` | Optional  | PostgreSQL driver           |
| `@mikro-orm/mysql`      | Optional  | MySQL driver                |
| `@mikro-orm/sqlite`     | Optional  | SQLite driver               |

## Quick Start

### Easiest: Use the Baileys Helper

The simplest way to integrate with Baileys - just pass the state directly:

```typescript
import {
  BaileysAuthStore,
  BaileysRedisAdapter,
  BaileysOrmAdapter,
  useBaileysAuthState,
} from 'wa-auth-store';
import { makeWASocket } from '@whiskeysockets/baileys';

// Setup
const redisAdapter = new BaileysRedisAdapter('redis://localhost:6379');
await redisAdapter.connect();

const ormAdapter = new BaileysOrmAdapter(orm.em, CredentialsEntity);
const authStore = new BaileysAuthStore(redisAdapter, ormAdapter);

// Get ready-to-use state
const { state, saveCreds } = await useBaileysAuthState(authStore, 'session-123');

// Pass to Baileys - that's it!
const { socket } = makeWASocket({
  auth: state,
  printQRInTerminal: true,
});

// Save when credentials update
socket.ev.on('creds.update', saveCreds);
```

### Session ID: Multi-Session or Single Session

This package is designed for **multi-session WhatsApp management**, but it works perfectly for single sessions too:

**Multi-Session Example** (manage multiple WhatsApp accounts):

```typescript
// Each user gets their own session
const user1State = await useBaileysAuthState(authStore, 'user-123');
const user2State = await useBaileysAuthState(authStore, 'user-456');
const user3State = await useBaileysAuthState(authStore, 'user-789');
```

**Single Session Example** (one WhatsApp account):

```typescript
// Use phone number as session ID for a single account
const { state, saveCreds } = await useBaileysAuthState(authStore, '1234567890');

const { socket } = makeWASocket({
  auth: state,
  printQRInTerminal: true,
});

socket.ev.on('creds.update', saveCreds);
```

**The session ID is just a unique identifier** - use whatever makes sense for your use case:

- User IDs: `'user-123'`, `'user-456'`
- Phone numbers: `'1234567890'`, `'9876543210'`
- Email addresses: `'user@example.com'`
- Custom identifiers: `'whatsapp-bot-1'`, `'support-team'`

### Manual Usage with Redis Only

```typescript
import { BaileysAuthStore, BaileysRedisAdapter } from 'wa-auth-store';

// Initialize Redis adapter
const redisAdapter = new BaileysRedisAdapter('redis://localhost:6379');
await redisAdapter.connect();

// Create auth store (Redis only)
const authStore = new BaileysAuthStore(redisAdapter);

// Save Baileys credentials
await authStore.saveCreds('session-123', {
  creds: authenticationCreds, // Your Baileys AuthenticationCreds
  keys: signalDataMap, // Your SignalDataTypeMap
});

// Retrieve credentials
const credential = await authStore.getCreds('session-123');
console.log(credential);

// Get specific keys
const appStateKeys = await authStore.getKeys('session-123', 'app-state-sync-key', [
  'key-id-1',
  'key-id-2',
]);

// Delete session
await authStore.deleteCreds('session-123');
```

### With PostgreSQL Persistence (MikroORM)

```typescript
import { MikroORM } from '@mikro-orm/postgresql';
import { BaileysAuthStore, BaileysRedisAdapter, BaileysOrmAdapter } from 'wa-auth-store';
import { CredentialsEntity } from './entities/credentials.entity';

// Initialize MikroORM
const orm = await MikroORM.init({
  entities: [CredentialsEntity],
  dbName: 'baileys_db',
  user: 'postgres',
  password: 'password',
  host: 'localhost',
});

// Initialize adapters
const redisAdapter = new BaileysRedisAdapter('redis://localhost:6379');
await redisAdapter.connect();

const ormAdapter = new BaileysOrmAdapter(orm.em, CredentialsEntity);

// Create auth store with both adapters
const authStore = new BaileysAuthStore(redisAdapter, ormAdapter);

// Save credentials (syncs to both Redis and PostgreSQL)
await authStore.saveCreds(
  'session-123',
  {
    creds: authenticationCreds,
    keys: signalDataMap,
  },
  {
    syncToDatabase: true,
    ttl: 3600, // 1 hour TTL in Redis
  }
);

// Retrieve - prefers Redis, falls back to database
const credential = await authStore.getCreds('session-123');

// Cleanup
await redisAdapter.disconnect();
await orm.close();
```

### Integration with Baileys

```typescript
import { useWhatsAppWeb } from '@whiskeysockets/baileys';
import { BaileysAuthStore, BaileysRedisAdapter, BaileysOrmAdapter } from 'wa-auth-store';

const redisAdapter = new BaileysRedisAdapter();
await redisAdapter.connect();

const ormAdapter = new BaileysOrmAdapter(orm.em, CredentialsEntity);
const authStore = new BaileysAuthStore(redisAdapter, ormAdapter);

const { state, saveCreds } = useWhatsAppWeb({
  auth: {
    creds: (await authStore.getCreds('session-id'))?.creds,
    keys: {
      get: async (type, ids) => {
        return authStore.getKeys('session-id', type, ids);
      },
      set: async (data) => {
        await authStore.setKeys('session-id', data);
      },
    },
  },
});

// Override saveCreds to use our store
const originalSaveCreds = saveCreds;
saveCreds = async () => {
  await authStore.saveCreds('session-id', {
    creds: state.creds,
    keys: state.keys,
  });
};
```

## API Reference

### useBaileysAuthState (Recommended for Baileys)

The easiest way to integrate with Baileys. Returns a complete authentication state with automatic credential and key management.

```typescript
const { state, saveCreds } = await useBaileysAuthState(authStore, sessionId, options?);
```

**Parameters:**

- `authStore` (BaileysAuthStore) - Initialized auth store
- `sessionId` (string) - Unique session identifier
- `options` (optional):
  - `ttl?: number` - Redis TTL in seconds
  - `syncToDatabase?: boolean` - Sync to database (default: true)

**Returns:**

```typescript
{
  state: AuthenticationState,      // Ready for Baileys
  saveCreds: () => Promise<void>   // Call on creds.update
}
```

**Example:**

```typescript
const { state, saveCreds } = await useBaileysAuthState(authStore, 'session-123');

const { socket } = makeWASocket({ auth: state });
socket.ev.on('creds.update', saveCreds);
```

### BaileysAuthStore

#### `getCreds(sessionId)`

Get credentials - prefers Redis, falls back to database.

- **sessionId** (string): Session identifier
- **Returns**: Promise<Partial<BaileysCredential> | null>

#### `saveCreds(sessionId, credential, options?)`

Save credentials to both Redis and database.

- **sessionId** (string): Session identifier
- **credential** (Partial<BaileysCredential>): Credential data with `creds` and/or `keys`
- **options** (optional): `{ syncToDatabase?: boolean, ttl?: number }`
- **Returns**: Promise<void>

#### `deleteCreds(sessionId)`

Delete credentials from both Redis and database.

- **sessionId** (string): Session identifier
- **Returns**: Promise<void>

#### `getKeys(sessionId, type, ids)`

Get specific keys - prefers Redis, falls back to database.

- **sessionId** (string): Session identifier
- **type** (string): Key type (e.g., 'app-state-sync-key', 'pre-key')
- **ids** (string[]): Key IDs to retrieve
- **Returns**: Promise<Record<string, unknown>>

#### `setKeys(sessionId, data)`

Set keys in both Redis and database.

- **sessionId** (string): Session identifier
- **data** (Record<string, Record<string, unknown>>): Keys organized by type
- **Returns**: Promise<void>

#### `deleteKeys(sessionId, fields)`

Delete specific keys from both Redis and database.

- **sessionId** (string): Session identifier
- **fields** (string[]): Field names to delete
- **Returns**: Promise<void>

#### `clearSession(sessionId)`

Clear all data for a session.

- **sessionId** (string): Session identifier
- **Returns**: Promise<void>

## Creating a Credentials Entity

Example MikroORM entity for PostgreSQL:

```typescript
import { Entity, PrimaryKey, Property, Index, Unique } from '@mikro-orm/core';

@Entity()
export class CredentialsEntity {
  @PrimaryKey()
  id!: number;

  @Property()
  @Unique()
  @Index()
  sessionId!: string;

  @Property({ type: 'jsonb', nullable: true })
  creds?: unknown; // Baileys AuthenticationCreds

  @Property({ type: 'jsonb', nullable: true })
  keys?: Record<string, unknown>; // SignalDataTypeMap entries

  @Property()
  createdAt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt = new Date();
}
```

## Creating Custom ORM Adapters

To add support for a different ORM or database, extend the `BaileysOrmAdapter` class:

```typescript
import { BaileysOrmAdapter } from 'wa-auth-store';
import type { BaileysCredential } from 'wa-auth-store';

export class CustomOrmAdapter extends BaileysOrmAdapter {
  // Inherit all methods from BaileysOrmAdapter
  // Customize as needed for your ORM
}
```

## Redis Memory Management (LRU Eviction)

For production environments with hundreds or thousands of users, Redis memory can quickly become saturated. The `RedisMemoryManager` implements intelligent LRU (Least Recently Used) eviction to keep Redis within a controlled memory range.

### Features

- **Automatic Memory Monitoring**: Periodically checks Redis memory usage
- **LRU Eviction**: Automatically removes least-recently-used sessions when memory threshold is exceeded
- **Inactivity Cleanup**: Removes sessions that haven't been accessed for a configurable period
- **Graceful Fallback**: Evicted credentials are automatically retrieved from PostgreSQL on next login
- **Configurable Limits**: Set max memory, eviction threshold, and inactivity timeout

### Configuration

```typescript
import { RedisMemoryManager } from 'wa-auth-store';

const memoryConfig = {
  maxMemoryBytes: 1024 * 1024 * 1024, // 1GB (default)
  evictionThreshold: 80, // Trigger eviction at 80% (default)
  ttlInactivity: 7 * 24 * 60 * 60, // 7 days (default)
  checkIntervalMs: 5 * 60 * 1000, // Check every 5 minutes (default)
};

const memoryManager = new RedisMemoryManager(redisClient, memoryConfig);
await memoryManager.start();
```

### Usage with BaileysRedisAdapter

```typescript
import { BaileysRedisAdapter, RedisMemoryManager } from 'wa-auth-store';

const redisAdapter = new BaileysRedisAdapter('redis://localhost:6379');
const memoryManager = new RedisMemoryManager(redisAdapter.redis, {
  maxMemoryBytes: 2 * 1024 * 1024 * 1024, // 2GB
  evictionThreshold: 75, // Evict at 75%
  ttlInactivity: 3 * 24 * 60 * 60, // 3 days
});

await memoryManager.start();

// Track access on every credential operation
await memoryManager.trackAccess(sessionId, estimatedSize);

// Get memory statistics
const stats = await memoryManager.getStats();
console.log(stats);
// {
//   memoryUsage: { usedBytes: 500000000, maxBytes: 2147483648, percentUsed: 23.3 },
//   totalSessions: 1250,
//   sessionMetadata: [...]
// }

// Stop monitoring when done
await memoryManager.stop();
```

### How It Works

1. **Access Tracking**: Each time a credential is accessed, the manager records:
   - Last access timestamp
   - Access count
   - Estimated size in bytes

2. **Memory Monitoring**: Every `checkIntervalMs`, the manager:
   - Checks current Redis memory usage
   - If usage > `evictionThreshold`, triggers LRU eviction
   - Removes sessions not accessed for `ttlInactivity` seconds

3. **LRU Eviction**: Sessions are sorted by last access time and removed oldest-first until memory drops below threshold

4. **Fallback**: When a session is needed again:
   - If not in Redis (evicted), it's retrieved from PostgreSQL
   - Automatically reloaded into Redis
   - Access tracking resumes

### Configuration Recommendations

**Small deployments (< 100 users):**

```typescript
{
  maxMemoryBytes: 512 * 1024 * 1024, // 512MB
  evictionThreshold: 85,
  ttlInactivity: 14 * 24 * 60 * 60, // 14 days
}
```

**Medium deployments (100-1000 users):**

```typescript
{
  maxMemoryBytes: 2 * 1024 * 1024 * 1024, // 2GB
  evictionThreshold: 80,
  ttlInactivity: 7 * 24 * 60 * 60, // 7 days
}
```

**Large deployments (1000+ users):**

```typescript
{
  maxMemoryBytes: 8 * 1024 * 1024 * 1024, // 8GB
  evictionThreshold: 75,
  ttlInactivity: 3 * 24 * 60 * 60, // 3 days
}
```

## Development

### Setup

```bash
npm install
```

### Commands

- `npm run dev`: Run in watch mode
- `npm run build`: Build for production
- `npm run test`: Run tests
- `npm run lint`: Lint code
- `npm run lint:fix`: Fix linting issues
- `npm run format`: Format code with Prettier

### Testing

```bash
npm run test
npm run test:ui  # Open UI dashboard
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

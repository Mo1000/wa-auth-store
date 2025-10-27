# wa-auth-store Setup Guide

## Project Overview

`wa-auth-store` is a TypeScript library for managing WhatsApp Baileys credentials with Redis caching and database persistence via MikroORM.

### Architecture

The library follows a hybrid approach:
- **Redis** for fast, in-memory access to credentials
- **Database** (via MikroORM) for persistent storage
- **Fallback pattern**: Check Redis first, fall back to database, then cache the result

### Key Components

1. **BaileysRedisAdapter** (`src/adapters/BaileysRedisAdapter.ts`)
   - Handles Redis operations for credentials and keys
   - Uses `ioredis` for Redis client

2. **BaileysOrmAdapter** (`src/adapters/BaileysOrmAdapter.ts`)
   - Abstract base class for ORM-based persistence
   - Works with MikroORM and any supported database

3. **BaileysAuthStore** (`src/core/BaileysAuthStore.ts`)
   - Main orchestrator combining Redis and ORM adapters
   - Implements the hybrid caching strategy

## Installation & Setup

### 1. Install Dependencies

```bash
cd /Users/amoslandry/Documents/professionnel/02-Smarttco/wa-session/wa-auth-store
pnpm install
```

### 2. Build the Project

```bash
pnpm run build
```

### 3. Run Tests

```bash
pnpm run test
```

## Development

### Available Scripts

- `pnpm run dev` - Run in watch mode with ts-node-dev
- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm run test` - Run Vitest tests
- `pnpm run test:ui` - Open Vitest UI dashboard
- `pnpm run lint` - Check code with ESLint
- `pnpm run lint:fix` - Auto-fix linting issues
- `pnpm run format` - Format code with Prettier

## Project Structure

```
src/
├── adapters/
│   ├── BaileysRedisAdapter.ts    # Redis adapter
│   └── BaileysOrmAdapter.ts      # ORM base adapter
├── core/
│   └── BaileysAuthStore.ts       # Main store class
├── types/
│   └── index.ts                  # Type definitions
├── __tests__/
│   └── BaileysAuthStore.test.ts  # Test suite
└── index.ts                      # Public exports
```

## Integration with Your Project

### Step 1: Create Credentials Entity

In your `whatsapp-recaller` project, create a credentials entity:

```typescript
// src/lib/entities/credentials.entity.ts
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
  creds?: unknown;

  @Property({ type: 'jsonb', nullable: true })
  keys?: Record<string, unknown>;

  @Property()
  createdAt = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt = new Date();
}
```

### Step 2: Initialize the Store

```typescript
import { BaileysAuthStore, BaileysRedisAdapter, BaileysOrmAdapter } from 'wa-auth-store';
import { CredentialsEntity } from './entities/credentials.entity';

// In your Baileys setup
const redisAdapter = new BaileysRedisAdapter('redis://localhost:6379');
await redisAdapter.connect();

const ormAdapter = new BaileysOrmAdapter(orm.em, CredentialsEntity);
const authStore = new BaileysAuthStore(redisAdapter, ormAdapter);

// Use with Baileys
const { state, saveCreds } = useWhatsAppWeb({
  auth: {
    creds: (await authStore.getCreds(sessionId))?.creds,
    keys: {
      get: async (type, ids) => authStore.getKeys(sessionId, type, ids),
      set: async (data) => authStore.setKeys(sessionId, data),
    },
  },
});
```

## Key Differences from useRedisAuthState

While `wa-auth-store` is inspired by your `useRedisAuthState` helper, it provides:

1. **Reusability**: Packaged as a library, not tied to a specific project
2. **Type Safety**: Full TypeScript support with proper types
3. **Flexibility**: Works with any MikroORM-supported database
4. **Testing**: Comprehensive test suite
5. **Documentation**: Clear API and usage examples

## Next Steps

1. Install the package in your `whatsapp-recaller` project
2. Create the credentials entity
3. Replace your `useRedisAuthState` calls with `BaileysAuthStore`
4. Run tests to ensure everything works

## Troubleshooting

### Module not found errors

If you see "Cannot find module" errors for `ioredis` or `@mikro-orm/core`:
- These are dev dependencies and will be available after `pnpm install`
- The build process requires these to be installed

### Redis connection issues

- Ensure Redis is running on `localhost:6379` (or update the connection string)
- Check Redis connectivity: `redis-cli ping`

### Database issues

- Ensure your MikroORM configuration is correct
- Check database credentials and connectivity
- Run migrations if needed

## Support

For questions or issues, refer to:
- README.md for API documentation
- src/__tests__/ for usage examples
- Your existing useRedisAuthState implementation for reference

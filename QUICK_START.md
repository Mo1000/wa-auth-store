# wa-auth-store Quick Start

## 30-Second Overview

`wa-auth-store` is a reusable library that extracts the credential management pattern from your `useRedisAuthState` helper into a standalone, tested, and publishable package.

**What it does:**
- Stores Baileys credentials in Redis (fast)
- Syncs to database via MikroORM (persistent)
- Falls back to database if Redis misses (reliable)

## Installation

```bash
cd /Users/amoslandry/Documents/professionnel/02-Smarttco/wa-session/wa-auth-store
pnpm install
pnpm run build
pnpm run test  # Should show 6/6 passing
```

## Basic Usage

```typescript
import { BaileysAuthStore, BaileysRedisAdapter, BaileysOrmAdapter } from 'wa-auth-store';

// 1. Create adapters
const redisAdapter = new BaileysRedisAdapter('redis://localhost:6379');
await redisAdapter.connect();

const ormAdapter = new BaileysOrmAdapter(orm.em, CredentialsEntity);

// 2. Create store
const authStore = new BaileysAuthStore(redisAdapter, ormAdapter);

// 3. Use it
await authStore.saveCreds('session-id', {
  creds: authenticationCreds,
  keys: signalDataMap,
});

const credential = await authStore.getCreds('session-id');
```

## API Quick Reference

### Main Methods

```typescript
// Save credentials to both Redis and database
await authStore.saveCreds(sessionId, credential, options?);

// Get credentials (Redis first, then database)
const cred = await authStore.getCreds(sessionId);

// Delete credentials from both stores
await authStore.deleteCreds(sessionId);

// Get specific keys
const keys = await authStore.getKeys(sessionId, type, ids);

// Set keys in both stores
await authStore.setKeys(sessionId, data);

// Delete specific keys
await authStore.deleteKeys(sessionId, fields);

// Clear a session
await authStore.clearSession(sessionId);
```

## Integration with Baileys

```typescript
const { state, saveCreds } = useWhatsAppWeb({
  auth: {
    creds: (await authStore.getCreds(sessionId))?.creds,
    keys: {
      get: async (type, ids) => authStore.getKeys(sessionId, type, ids),
      set: async (data) => authStore.setKeys(sessionId, data),
    },
  },
});

// Override saveCreds
const originalSaveCreds = saveCreds;
saveCreds = async () => {
  await authStore.saveCreds(sessionId, {
    creds: state.creds,
    keys: state.keys,
  });
};
```

## Project Structure

```
src/
├── adapters/
│   ├── BaileysRedisAdapter.ts    # Redis operations
│   └── BaileysOrmAdapter.ts      # ORM persistence
├── core/
│   └── BaileysAuthStore.ts       # Main orchestrator
├── types/
│   └── index.ts                  # Type definitions
├── __tests__/
│   └── BaileysAuthStore.test.ts  # Tests (6 passing)
└── index.ts                      # Public API
```

## Available Scripts

```bash
pnpm run dev        # Watch mode development
pnpm run build      # Compile TypeScript
pnpm run test       # Run tests
pnpm run test:ui    # Open test dashboard
pnpm run lint       # Check code style
pnpm run lint:fix   # Auto-fix issues
pnpm run format     # Format code
```

## Key Differences from useRedisAuthState

| Aspect | useRedisAuthState | wa-auth-store |
|--------|------------------|---------------|
| Location | In your project | Standalone library |
| Reusable | No | Yes ✅ |
| Testable | Hard | Easy ✅ |
| Typed | Partial | Full ✅ |
| Published | No | Ready ✅ |

## Common Patterns

### Redis Only (No Database)
```typescript
const authStore = new BaileysAuthStore(redisAdapter);
// No ORM adapter = no database sync
```

### With Database Sync
```typescript
const authStore = new BaileysAuthStore(redisAdapter, ormAdapter);
// Automatically syncs to database
```

### Disable Database Sync for Single Operation
```typescript
await authStore.saveCreds(sessionId, credential, {
  syncToDatabase: false,  // Skip database for this save
});
```

### Set Redis TTL
```typescript
await authStore.saveCreds(sessionId, credential, {
  ttl: 3600,  // 1 hour expiration in Redis
});
```

## Troubleshooting

**Redis connection error?**
- Ensure Redis is running: `redis-cli ping`
- Check connection string: `redis://localhost:6379`

**Database errors?**
- Verify MikroORM config
- Check database credentials
- Ensure credentials table exists

**Type errors?**
- Run `pnpm install` to get all types
- Check that CredentialsEntity matches interface

## Next Steps

1. ✅ Library created and tested
2. ⏭️ Install in your whatsapp-recaller project
3. ⏭️ Create CredentialsEntity if needed
4. ⏭️ Replace useRedisAuthState with BaileysAuthStore
5. ⏭️ Run your tests

## Documentation

- **README.md** - Full API documentation
- **SETUP.md** - Detailed setup guide
- **IMPLEMENTATION_SUMMARY.md** - Architecture overview
- **src/__tests__/** - Usage examples in tests

---

**Status**: ✅ Ready to use
**Tests**: 6/6 passing
**Build**: ✅ Successful

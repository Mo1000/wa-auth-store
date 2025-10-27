# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2025-10-27

### Added

- **Extended `BaileysRedisAdapter.setKeys()`**:
  - Now accepts optional `options?: { ttl?: number }` parameter
  - Sets Redis expiration on keys hash when TTL is provided
  - Maintains backward compatibility with existing code

- **Extended `BaileysAuthStore.setKeys()`**:
  - Now accepts optional `options?: { ttl?: number }` parameter
  - Passes TTL configuration to Redis adapter

  - **TTL Support for Keys**:
  - Extended `setKeys()` to accept TTL options
  - Keys now expire with the same TTL as credentials
  - Automatic TTL propagation in `useBaileysAuthState` helper
  - Consistent expiration for both credentials and keys

## [0.3.0] - 2025-10-27

### Added

- **Redis Memory Management**: Automatic LRU (Least Recently Used) eviction strategy
  - `RedisMemoryManager` class for intelligent memory management
  - Configurable memory limits (default: 1GB)
  - Automatic eviction when memory threshold exceeded (default: 80%)
  - Inactivity-based cleanup for unused credentials (default: 7 days)
  - Periodic memory monitoring (default: every 5 minutes)
  - Access tracking for each session (last access time, access count, estimated size)
  - Graceful fallback to database for evicted credentials

- **Integration with `useBaileysAuthState` helper**:
  - New `redisMemoryConfig` option for memory management configuration
  - New `redis` option to provide Redis client instance
  - Returns `memoryManager` instance for monitoring and statistics
  - Automatic access tracking on every credential/key operation

- **Memory Statistics API**:
  - `getMemoryUsage()`: Get current Redis memory usage
  - `getStats()`: Get comprehensive memory statistics including session metadata
  - `trackAccess()`: Manual access tracking for sessions
  - `clear()`: Clear all tracked metadata

- **Documentation**:
  - `REDIS_MEMORY_MANAGEMENT.md` with complete usage guide
  - Configuration recommendations for different deployment sizes
  - Best practices for production environments

### Changed

- Enhanced `BaileysOrmAdapter` with better error handling:
  - Added `getStringifyData()` helper for safe JSON serialization
  - Added `getParseData()` helper for safe JSON deserialization
  - Improved `getCreds()` with fallback handling
  - Optimized `deleteCreds()` using native delete for better performance

- Updated README with Redis memory management feature in features list

### Technical Details

- Memory manager runs asynchronously without blocking credential operations
- LRU eviction is efficient for typical workloads (hundreds to thousands of sessions)
- Metadata persisted in Redis for recovery after restarts
- Access tracking adds minimal overhead (~1ms per operation)

---

## [0.2.0] - 2025-10-20

### Added

- **Hybrid Storage Architecture**:
  - Redis adapter for fast in-memory caching
  - ORM adapter for persistent database storage
  - Automatic fallback from Redis to database
  - Cache warming on database retrieval

- **Multi-Session Support**:
  - Manage multiple WhatsApp accounts simultaneously
  - Session-based credential isolation
  - Per-session TTL configuration

- **Type-Safe Implementation**:
  - Full TypeScript support with strict type checking
  - Proper handling of Baileys `AuthenticationCreds` and `SignalDataTypeMap`
  - Type-safe ORM adapter pattern

- **Database Flexibility**:
  - Support for PostgreSQL via `@mikro-orm/postgresql`
  - Support for MySQL via `@mikro-orm/mysql`
  - Support for SQLite via `@mikro-orm/sqlite`
  - Easy to extend for other databases

- **API Reference Documentation**:
  - Complete `BaileysAuthStore` API documentation
  - `BaileysRedisAdapter` usage examples
  - `BaileysOrmAdapter` customization guide
  - Entity creation examples

### Changed

- Improved credential serialization with `BufferJSON` for proper Buffer handling
- Enhanced key management with type-specific handling

---

## [0.1.0] - 2025-10-15

### Added

- **Initial Release**:
  - `BaileysAuthStore`: Main store for managing credentials
  - `BaileysRedisAdapter`: Redis-based credential storage
  - `useBaileysAuthState()`: Helper function for Baileys integration
  - TTL support for automatic credential expiration in Redis
  - Database persistence foundation

- **Core Features**:
  - Store Baileys credentials in Redis for quick retrieval
  - Sync credentials to database for persistence
  - Hybrid approach: prefer Redis, fall back to database
  - Baileys-optimized handling of `creds` and `keys`

- **Documentation**:
  - Quick start guide
  - Installation instructions
  - Basic usage examples
  - API reference

---

## Migration Guide

### From 0.2.x to 0.3.1

To enable Redis memory management:

```typescript
import { useBaileysAuthState } from 'wa-auth-store';
import Redis from 'ioredis';

const redis = new Redis();

const { state, saveCreds, memoryManager } = await useBaileysAuthState(authStore, sessionId, {
  // New: Add memory management configuration
  redisMemoryConfig: {
    maxMemoryBytes: 1024 * 1024 * 1024, // 1GB
    evictionThreshold: 80,
    ttlInactivity: 7 * 24 * 60 * 60,
    checkIntervalMs: 5 * 60 * 1000,
  },
  redis: redis,
});

// Don't forget to stop the memory manager on shutdown
process.on('SIGINT', async () => {
  if (memoryManager) {
    await memoryManager.stop();
  }
});
```

Memory management is **optional** - existing code continues to work without changes.

---

## Deprecations

None at this time.

---

## Known Issues

None at this time.

---

## Future Roadmap

- [ ] Support for other caching backends (Memcached, etc.)
- [ ] Advanced eviction strategies (LFU, TTL-based)
- [ ] Metrics and monitoring integration (Prometheus)
- [ ] Distributed session management
- [ ] Performance optimizations for large-scale deployments

# Redis Memory Management Integration

## Overview

The `useBaileysAuthState` helper now includes **automatic Redis memory management** with LRU (Least Recently Used) eviction. This prevents Redis from consuming unlimited memory by automatically deleting unused credentials.

## Features

- **Configurable Memory Limits**: Set max Redis memory (default: 1GB)
- **Automatic LRU Eviction**: Deletes least-recently-used credentials when memory threshold is exceeded
- **Inactivity Timeout**: Removes credentials unused for a configurable period (default: 7 days)
- **Periodic Monitoring**: Checks memory usage at regular intervals (default: 5 minutes)
- **Access Tracking**: Tracks last access time and frequency for each session
- **Fallback to Database**: Evicted credentials can be restored from PostgreSQL on next login

## Configuration

Pass `redisMemoryConfig` and `redis` client to `useBaileysAuthState`:

```typescript
import Redis from 'ioredis';
import { useBaileysAuthState } from './helpers/baileys';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

const { state, saveCreds, memoryManager } = await useBaileysAuthState(
  authStore,
  'session-123',
  {
    // Optional: Configure memory management
    redisMemoryConfig: {
      maxMemoryBytes: 1024 * 1024 * 1024,  // 1GB
      evictionThreshold: 80,                // Evict at 80% capacity
      ttlInactivity: 7 * 24 * 60 * 60,     // 7 days in seconds
      checkIntervalMs: 5 * 60 * 1000,      // Check every 5 minutes
    },
    redis: redis,
  }
);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxMemoryBytes` | number | 1GB | Maximum Redis memory allowed |
| `evictionThreshold` | number | 80 | Percentage of max memory to trigger eviction |
| `ttlInactivity` | number | 604800 (7 days) | Seconds before deleting unused credentials |
| `checkIntervalMs` | number | 300000 (5 min) | How often to check memory usage |

## How It Works

1. **Access Tracking**: Every time credentials or keys are accessed, the timestamp is updated
2. **Memory Monitoring**: Periodic checks measure Redis memory usage
3. **LRU Eviction**: When memory exceeds the threshold:
   - Sessions are sorted by last access time
   - Least recently used sessions are deleted first
   - Process continues until memory drops below threshold
4. **Inactivity Cleanup**: Sessions unused for `ttlInactivity` seconds are automatically deleted
5. **Fallback**: If a user logs in with evicted credentials, they're restored from the database

## Usage Example

```typescript
// Initialize with memory management
const { state, saveCreds, memoryManager } = await useBaileysAuthState(
  authStore,
  sessionId,
  {
    redisMemoryConfig: {
      maxMemoryBytes: 512 * 1024 * 1024,  // 512MB limit
      evictionThreshold: 75,
      ttlInactivity: 3 * 24 * 60 * 60,    // 3 days
      checkIntervalMs: 10 * 60 * 1000,    // Check every 10 minutes
    },
    redis: redisClient,
  }
);

// Use with Baileys
const { socket } = makeWASocket({
  auth: state,
  // ... other options
});

socket.ev.on('creds.update', async () => {
  await saveCreds();
});

// Get memory statistics
const stats = await memoryManager?.getStats();
console.log(`Redis Memory: ${stats?.memoryUsage.percentUsed}% used`);
console.log(`Active Sessions: ${stats?.totalSessions}`);

// Cleanup on shutdown
process.on('SIGINT', async () => {
  if (memoryManager) {
    await memoryManager.stop();
  }
  process.exit(0);
});
```

## Memory Manager API

The returned `memoryManager` object provides:

```typescript
interface RedisMemoryManager {
  // Start automatic monitoring
  start(): Promise<void>;

  // Stop monitoring and save metadata
  stop(): Promise<void>;

  // Track access to a session
  trackAccess(sessionId: string, estimatedSize?: number): Promise<void>;

  // Get current memory usage
  getMemoryUsage(): Promise<{
    usedBytes: number;
    maxBytes: number;
    percentUsed: number;
  }>;

  // Get statistics
  getStats(): Promise<{
    memoryUsage: { usedBytes: number; maxBytes: number; percentUsed: number };
    totalSessions: number;
    sessionMetadata: SessionAccessMetadata[];
  }>;

  // Clear all tracked metadata
  clear(): Promise<void>;
}
```

## Best Practices

1. **Set Appropriate Limits**: Choose `maxMemoryBytes` based on your server capacity
2. **Monitor Regularly**: Check `getStats()` to understand eviction patterns
3. **Adjust TTL**: Set `ttlInactivity` based on your usage patterns
4. **Graceful Shutdown**: Always call `memoryManager.stop()` before exiting
5. **Database Sync**: Ensure `syncToDatabase: true` (default) so evicted credentials can be restored

## Performance Considerations

- Memory checks run asynchronously and don't block credential operations
- LRU eviction is efficient for typical workloads (hundreds of sessions)
- Metadata is persisted in Redis for recovery after restarts
- Access tracking adds minimal overhead (~1ms per operation)

## Troubleshooting

**Memory not decreasing**: Check if `evictionThreshold` is set correctly and sessions are actually being evicted. Use `getStats()` to verify.

**Sessions being evicted too aggressively**: Increase `maxMemoryBytes` or `evictionThreshold`, or decrease `ttlInactivity`.

**Credentials lost after eviction**: Ensure `syncToDatabase: true` and database adapter is configured so credentials can be restored.

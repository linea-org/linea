import { Redis } from "ioredis"
import type { Queue } from "bullmq"
import { getRedisUrl } from "./env.js"

/** maxRetriesPerRequest: null is required by BullMQ for any connection a Worker uses. */
export function createConnection(): Redis {
  const connection = new Redis(getRedisUrl(), { maxRetriesPerRequest: null })
  // ioredis emits "error" on the client itself, not just on failed commands — with no listener, Node treats it as an unhandled error and crashes. Kept as defense-in-depth alongside closeQueueConnection() below, which fixes the specific teardown race rather than just muting its symptom.
  connection.on("error", (error: Error) => {
    if (error.message.includes("Connection is closed")) return
    console.error(`Redis connection error: ${error.message}`)
  })
  return connection
}

/**
 * BullMQ wraps a given connection in its own internal RedisConnection, whose constructor does
 * `this.initializing.catch(err => this.emit('error', err))` — a promise handler that outlives
 * `queue.close()`. Because this connection is externally owned ("shared" from BullMQ's point of
 * view), close() still strips that wrapper's own listeners via removeAllListeners() in its
 * `finally` block, same as for a connection BullMQ owns outright. If the initial handshake is
 * still in flight when close() runs (common under parallel test load), the later settlement finds
 * no listeners left and throws as an unhandled rejection — attributed to whatever test happens to
 * be running at that moment. Awaiting waitUntilReady() first (which resolves the same promise)
 * guarantees it has already settled, with its listeners still attached, before close() removes them.
 */
export async function closeQueueConnection<T>(
  queue: Queue<T>,
  connection: Redis
): Promise<void> {
  await queue.waitUntilReady().catch(() => {})
  await queue.close()
  await connection.quit()
}

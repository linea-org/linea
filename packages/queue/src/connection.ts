import { Redis } from "ioredis"
import { getRedisUrl } from "./env.js"

/** maxRetriesPerRequest: null is required by BullMQ for any connection a Worker uses. */
export function createConnection(): Redis {
  const connection = new Redis(getRedisUrl(), { maxRetriesPerRequest: null })
  // ioredis emits "error" on the client itself, not just on failed commands — with no listener, Node treats it as an unhandled error and crashes. BullMQ's own listeners can already be torn down by the time a shared connection finishes closing (queue.close() then connection.quit()), leaving a stray "Connection is closed" error from that expected race with nothing to catch it — swallowed here rather than logged. Anything else is a genuine connectivity issue worth surfacing.
  connection.on("error", (error: Error) => {
    if (error.message.includes("Connection is closed")) return
    console.error(`Redis connection error: ${error.message}`)
  })
  return connection
}

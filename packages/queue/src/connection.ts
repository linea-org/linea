import { Redis } from "ioredis"
import { getRedisUrl } from "./env.js"

/** maxRetriesPerRequest: null is required by BullMQ for any connection a Worker uses. */
export function createConnection(): Redis {
  return new Redis(getRedisUrl(), { maxRetriesPerRequest: null })
}

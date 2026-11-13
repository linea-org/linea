import { randomUUID } from "node:crypto"
import { Redis } from "ioredis"
import { createAuthRateLimiter } from "./auth-rate-limit.js"

/** Specs share one Redis, so each limiter gets a fresh key prefix; callers must quit the client. */
export function createTestRateLimiter(redisUrl: string | undefined) {
  if (!redisUrl) {
    throw new Error("REDIS_URL is required to run auth rate limit specs")
  }
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 })
  const prefix = `auth-rate-limit-test:${randomUUID()}`
  return { redis, prefix, limiter: createAuthRateLimiter(redis, prefix) }
}

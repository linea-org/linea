import { createHash } from "node:crypto"
import { Redis } from "ioredis"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { z } from "zod"
import { reserveDocsAssistantUsage } from "./docs-assistant-budget"

const redisUrl = process.env.DOCS_ASSISTANT_TEST_REDIS_URL
const key = "{docs-assistant}:budget:v1"
const commandSchema = z.tuple([
  z.literal("EVAL"),
  z.string(),
  z.literal(1),
  z.string(),
  z.string(),
  z.number(),
])

describe.skipIf(!redisUrl)(
  "shared docs budget (isolated test Redis only)",
  () => {
    let redis: Redis
    beforeAll(async () => {
      if (!redisUrl)
        throw new Error(
          "Set DOCS_ASSISTANT_TEST_REDIS_URL to an isolated disposable Redis."
        )
      redis = new Redis(redisUrl)
      await redis.ping()
    })
    afterEach(async () => {
      await redis.del(key)
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })
    afterAll(async () => {
      await redis.quit()
    })
    function useStorage() {
      vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.invalid")
      vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test")
      vi.stubEnv("DOCS_AI_DAILY_REQUEST_LIMIT", "20000")
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        if (typeof init.body !== "string")
          throw new Error("Expected JSON command")
        const [, script, count, budgetKey, client, limit] = commandSchema.parse(
          JSON.parse(init.body)
        )
        const result = await redis.eval(script, count, budgetKey, client, limit)
        return Response.json({ result })
      })
    }
    it("shares atomic per-client limits across independently loaded instances", async () => {
      useStorage()
      vi.resetModules()
      const other = await import("./docs-assistant-budget")
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          (index % 2
            ? other.reserveDocsAssistantUsage
            : reserveDocsAssistantUsage)(
            "same-client",
            new AbortController().signal
          )
        )
      )
      expect(results.filter(Boolean)).toHaveLength(10)
      expect(await redis.hget(key, "total")).toBe("10")
      expect(await redis.ttl(key)).toBeGreaterThan(0)
      expect(await redis.ttl(key)).toBeLessThanOrEqual(86400)
    })
    it("admits a new visitor after 10,001 identities without a client table lockout", async () => {
      useStorage()
      for (let start = 0; start < 10_001; start += 100) {
        await Promise.all(
          Array.from({ length: Math.min(100, 10_001 - start) }, (_, offset) =>
            reserveDocsAssistantUsage(
              `client-${start + offset}`,
              new AbortController().signal
            )
          )
        )
      }
      expect(
        await reserveDocsAssistantUsage(
          "new-visitor",
          new AbortController().signal
        )
      ).toBe(true)
      expect(await redis.hlen(key)).toBe(10_004)
    }, 20_000)
    it("reserves the global daily ceiling atomically and creates no rejected client fields", async () => {
      useStorage()
      vi.stubEnv("DOCS_AI_DAILY_REQUEST_LIMIT", "20")
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          reserveDocsAssistantUsage(
            `client-${index}`,
            new AbortController().signal
          )
        )
      )
      expect(results.filter(Boolean)).toHaveLength(20)
      expect(await redis.hlen(key)).toBe(22)
      expect(await redis.hget(key, "total")).toBe("20")
    })
    it("preserves the per-client daily budget after the minute window resets", async () => {
      useStorage()
      await reserveDocsAssistantUsage("client", new AbortController().signal)
      const field = `client:${createHash("sha256").update("client").digest("hex")}`
      await redis.hset(key, field, "50:0:0")
      expect(
        await reserveDocsAssistantUsage("client", new AbortController().signal)
      ).toBe(false)
      expect(
        await reserveDocsAssistantUsage("other", new AbortController().signal)
      ).toBe(true)
    })
    it("retains existing daily usage and resets expired-day state", async () => {
      useStorage()
      await reserveDocsAssistantUsage("client", new AbortController().signal)
      await redis.hset(key, "total", "20000")
      expect(
        await reserveDocsAssistantUsage("another", new AbortController().signal)
      ).toBe(false)
      await redis.hset(key, "day", "0")
      expect(
        await reserveDocsAssistantUsage("another", new AbortController().signal)
      ).toBe(true)
      expect(await redis.hlen(key)).toBe(3)
    })
  }
)

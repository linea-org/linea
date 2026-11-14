import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"
import { magicLink } from "better-auth/plugins"
import { Redis } from "ioredis"
import {
  createAuthRateLimiter,
  EMAIL_DELIVERY_LIMIT,
  FAILED_SIGN_IN_LIMIT,
} from "./auth-rate-limit.js"
import { createTestRateLimiter } from "./test-rate-limiter.js"

const shared = createTestRateLimiter(process.env.REDIS_URL)
const secondInstanceRedis = new Redis(shared.redis.options)
const sentMagicLinks: string[] = []

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/limit_test")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  vi.stubEnv("BETTER_AUTH_SECRET", "auth-rate-limit-regression-test-secret")
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await shared.redis.quit()
  await secondInstanceRedis.quit()
})

async function createInstance(
  limiter: ReturnType<typeof createAuthRateLimiter>
) {
  const { auth } = await import("./auth.js")
  return betterAuth({
    ...auth.options,
    rateLimit: { ...auth.options.rateLimit, customStorage: limiter.storage },
    hooks: limiter.hooks,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      member: [],
      organization: [],
    }),
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email }) => {
          sentMagicLinks.push(email)
        },
      }),
    ],
  })
}

type Instance = Awaited<ReturnType<typeof createInstance>>

async function post(
  instance: Instance,
  path: string,
  ip: string,
  body: object
) {
  const response = await instance.handler(
    new Request(`http://localhost:3000/v1/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify(body),
    })
  )
  return response.status
}

async function signUp(instance: Instance, email: string, password: string) {
  const status = await post(instance, "/sign-up/email", "192.0.2.250", {
    email,
    password,
    name: "Rate limit owner",
  })
  expect(status).toBe(200)
}

it("shares per-IP limits across API instances", async () => {
  const first = await createInstance(shared.limiter)
  const second = await createInstance(
    createAuthRateLimiter(secondInstanceRedis, shared.prefix)
  )
  const statuses = []
  for (const instance of [first, first, second, second]) {
    statuses.push(
      await post(instance, "/sign-in/email", "192.0.2.10", { email: "invalid" })
    )
  }
  expect(statuses).toEqual([400, 400, 400, 429])
  // Better Auth's memory store is process-global, so also prove the count lives in Redis.
  expect(await secondInstanceRedis.keys(`${shared.prefix}:ip:*`)).toHaveLength(
    1
  )
})

it("locks an account after repeated failed sign-ins from rotating IPs", async () => {
  const instance = await createInstance(shared.limiter)
  const password = "AccountLockoutRegression123!"
  await signUp(instance, "lockout@example.test", password)
  for (let i = 1; i <= FAILED_SIGN_IN_LIMIT.max; i++) {
    const status = await post(instance, "/sign-in/email", `198.51.100.${i}`, {
      email: "lockout@example.test",
      password: `WrongPassword${i}!`,
    })
    expect(status, `failed attempt ${i}`).toBe(401)
  }
  expect(
    await post(instance, "/sign-in/email", "198.51.100.200", {
      email: "LOCKOUT@example.test",
      password,
    })
  ).toBe(429)
}, 60_000)

it("clears failed sign-ins after a successful sign-in", async () => {
  const instance = await createInstance(shared.limiter)
  const password = "AccountResetRegression123!"
  await signUp(instance, "reset-count@example.test", password)
  const attempt = (ip: string, attemptPassword: string) =>
    post(instance, "/sign-in/email", ip, {
      email: "reset-count@example.test",
      password: attemptPassword,
    })
  for (let i = 1; i < FAILED_SIGN_IN_LIMIT.max; i++) {
    expect(await attempt(`203.0.113.${i}`, `WrongPassword${i}!`)).toBe(401)
  }
  expect(await attempt("203.0.113.100", password)).toBe(200)
  expect(await attempt("203.0.113.101", "WrongPasswordAfter!")).toBe(401)
}, 60_000)

it("limits auth emails per recipient across endpoints and IPs", async () => {
  const instance = await createInstance(shared.limiter)
  sentMagicLinks.length = 0
  for (let i = 1; i <= EMAIL_DELIVERY_LIMIT.max; i++) {
    const email = i % 2 ? "inbox@example.test" : "INBOX@example.test"
    const status = await post(instance, "/sign-in/magic-link", `192.0.2.${i}`, {
      email,
    })
    expect(status, `magic link ${i}`).toBe(200)
  }
  expect(sentMagicLinks).toHaveLength(EMAIL_DELIVERY_LIMIT.max)
  expect(
    await post(instance, "/sign-in/magic-link", "192.0.2.100", {
      email: "inbox@example.test",
    })
  ).toBe(429)
  expect(
    await post(instance, "/request-password-reset", "192.0.2.101", {
      email: "inbox@example.test",
    })
  ).toBe(429)
  expect(sentMagicLinks).toHaveLength(EMAIL_DELIVERY_LIMIT.max)
  expect(
    await post(instance, "/sign-in/magic-link", "192.0.2.102", {
      email: "other-inbox@example.test",
    })
  ).toBe(200)
})

it("rejects auth requests when the limiter store is unavailable", async () => {
  const unavailable = new Redis("redis://127.0.0.1:1", {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  })
  const instance = await createInstance(
    createAuthRateLimiter(unavailable, shared.prefix)
  )
  await expect(
    post(instance, "/sign-in/email", "192.0.2.20", {
      email: "store-down@example.test",
      password: "StoreDownRegression123!",
    })
  ).rejects.toThrow("Connection is closed")
  unavailable.disconnect()
})

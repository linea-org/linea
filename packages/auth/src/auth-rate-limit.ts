import { createHash } from "node:crypto"
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api"
import type { Redis } from "ioredis"

type Rule = { window: number; max: number }

export const FAILED_SIGN_IN_LIMIT: Rule = { window: 15 * 60, max: 10 }
export const EMAIL_DELIVERY_LIMIT: Rule = { window: 60 * 60, max: 10 }

const emailDeliveryPaths = new Set([
  "/sign-in/magic-link",
  "/request-password-reset",
  "/send-verification-email",
  "/sign-up/email",
])

// Fixed window: the TTL is set only when the window opens, so rejected requests never extend it.
const consumeScript = `
redis.call('SET', KEYS[1], 0, 'PX', ARGV[1], 'NX')
if redis.call('INCR', KEYS[1]) <= tonumber(ARGV[2]) then return 0 end
return math.max(redis.call('PTTL', KEYS[1]), 1)
`

function requestEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null
  }
  return typeof body.email === "string" ? body.email : null
}

function unsupported(): never {
  throw new Error("Auth rate limiting only supports atomic consume")
}

/** Shares every limit across API instances; Redis failures reject the request instead of skipping the limit. */
export function createAuthRateLimiter(redis: Redis, prefix: string) {
  const consume = async (key: string, rule: Rule) => {
    const retryAfterMs = await redis.eval(
      consumeScript,
      1,
      `${prefix}:${key}`,
      rule.window * 1000,
      rule.max
    )
    if (typeof retryAfterMs !== "number") {
      throw new Error("Auth rate limit script returned a non-numeric result")
    }
    return {
      allowed: retryAfterMs === 0,
      retryAfter: retryAfterMs === 0 ? null : Math.ceil(retryAfterMs / 1000),
    }
  }
  const enforce = async (key: string, rule: Rule) => {
    const { retryAfter } = await consume(key, rule)
    if (retryAfter !== null) {
      throw new APIError(
        "TOO_MANY_REQUESTS",
        { message: "Too many requests. Please try again later." },
        { "X-Retry-After": String(retryAfter) }
      )
    }
  }
  // Lower-cased like Better Auth's own account lookup, so case variants share one bucket.
  const emailKey = (scope: string, email: string) =>
    `${scope}:${createHash("sha256").update(email.toLowerCase()).digest("hex")}`
  return {
    storage: {
      get: unsupported,
      set: unsupported,
      consume: (key: string, rule: Rule) => consume(`ip:${key}`, rule),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const email = requestEmail(ctx.body)
        if (email === null) return
        if (ctx.path === "/sign-in/email") {
          await enforce(emailKey("failed-sign-in", email), FAILED_SIGN_IN_LIMIT)
        } else if (emailDeliveryPaths.has(ctx.path)) {
          await enforce(emailKey("email-delivery", email), EMAIL_DELIVERY_LIMIT)
        }
      }),
      // Every attempt is counted up front so concurrent guesses cannot overrun the limit; success refunds them.
      after: createAuthMiddleware(async (ctx) => {
        const email = requestEmail(ctx.body)
        if (
          ctx.path !== "/sign-in/email" ||
          email === null ||
          isAPIError(ctx.context.returned)
        ) {
          return
        }
        await redis.del(`${prefix}:${emailKey("failed-sign-in", email)}`)
      }),
    },
  }
}

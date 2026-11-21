import { createHash } from "node:crypto"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"

type BindingStore = {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>
}

export const DEVICE_VERIFIER_HEADER = "x-linea-device-verifier"
// Matches how long a magic link lives, so a binding never outlasts its token.
const BINDING_TTL_SECONDS = 600
const challengePattern = /^[A-Za-z0-9_-]{43}$/

const bindingKey = (token: string) =>
  `magic-link-device:${createHash("sha256").update(token).digest("hex")}`

/** A request that carries a challenge ties its link to the device that holds the matching verifier. */
export async function bindMagicLinkToDevice(
  redis: BindingStore,
  token: string,
  metadata: Record<string, unknown> | undefined
): Promise<void> {
  const challenge = metadata?.deviceChallenge
  if (challenge === undefined) return
  if (typeof challenge !== "string" || !challengePattern.test(challenge)) {
    throw new APIError("BAD_REQUEST", { message: "Invalid device challenge." })
  }
  await redis.set(bindingKey(token), challenge, "EX", BINDING_TTL_SECONDS)
}

function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

/**
 * The native app always sends its verifier, so it only accepts a link bound to its own device; a
 * bound link is refused anywhere that can't present the verifier.
 */
export function magicLinkDeviceBinding(redis: BindingStore) {
  return {
    id: "magic-link-device-binding",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/magic-link/verify",
          handler: createAuthMiddleware(async (ctx) => {
            const token: unknown = ctx.query?.token
            if (typeof token !== "string") return
            const bound = await redis.get(bindingKey(token))
            const verifier = ctx.headers?.get(DEVICE_VERIFIER_HEADER)
            if (!bound && !verifier) return
            if (!bound || !verifier || challengeFor(verifier) !== bound) {
              throw new APIError("FORBIDDEN", {
                message: "This sign-in link was requested on another device.",
              })
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}

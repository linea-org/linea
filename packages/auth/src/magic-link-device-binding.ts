import { createHash } from "node:crypto"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"

export const DEVICE_VERIFIER_HEADER = "x-linea-device-verifier"
// Outlives the magic link itself, so a binding is never gone while its token still works.
const BINDING_TTL_MS = 10 * 60 * 1000
const challengePattern = /^[A-Za-z0-9_-]{43}$/

type BindingContext = {
  context: {
    internalAdapter: {
      createVerificationValue(data: {
        identifier: string
        value: string
        expiresAt: Date
      }): Promise<unknown>
    }
  }
}

const bindingIdentifier = (token: string) =>
  `magic-link-device:${createHash("sha256").update(token).digest("hex")}`

/** A request that carries a challenge ties its link to the device that holds the matching verifier. */
export async function bindMagicLinkToDevice(
  ctx: BindingContext | undefined,
  token: string,
  metadata: Record<string, unknown> | undefined
): Promise<void> {
  const challenge = metadata?.deviceChallenge
  if (challenge === undefined) return
  if (typeof challenge !== "string" || !challengePattern.test(challenge)) {
    throw new APIError("BAD_REQUEST", { message: "Invalid device challenge." })
  }
  if (!ctx) throw new Error("A device binding needs the request context")
  // Kept in the database beside the link's own record, so losing a cache can't drop the check.
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: bindingIdentifier(token),
    value: challenge,
    expiresAt: new Date(Date.now() + BINDING_TTL_MS),
  })
}

function challengeFor(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

/** The app always sends a verifier and accepts only links bound to it; a bound link needs its verifier. */
export function magicLinkDeviceBinding() {
  return {
    id: "magic-link-device-binding",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/magic-link/verify",
          handler: createAuthMiddleware(async (ctx) => {
            const token: unknown = ctx.query?.token
            if (typeof token !== "string") return
            const binding =
              await ctx.context.internalAdapter.findVerificationValue(
                bindingIdentifier(token)
              )
            const verifier = ctx.headers?.get(DEVICE_VERIFIER_HEADER)
            if (!binding && !verifier) return
            if (
              !binding ||
              !verifier ||
              challengeFor(verifier) !== binding.value
            ) {
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

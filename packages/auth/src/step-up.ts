import type { BetterAuthPlugin } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"

const codePaths = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
])

function returnedToken(returned: unknown): string | null {
  if (!returned || typeof returned !== "object") return null
  const body =
    "_flag" in returned && "body" in returned ? returned.body : returned
  if (!body || typeof body !== "object" || !("token" in body)) return null
  return typeof body.token === "string" ? body.token : null
}

/** Stamps the session whenever an authenticator code checks out, so sensitive actions can trust it. */
export function stepUp() {
  return {
    id: "step-up",
    hooks: {
      after: [
        {
          matcher: (context) => codePaths.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const token = returnedToken(ctx.context.returned)
            if (!token) return
            await ctx.context.internalAdapter.updateSession(token, {
              stepUpAt: new Date(),
            })
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}

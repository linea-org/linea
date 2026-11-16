import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

/** A Better Auth instance on an in-memory database with email verification off, for specs. */
export async function createIsolatedAuth() {
  const { auth } = await import("./auth.js")
  return betterAuth({
    ...auth.options,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      member: [],
      organization: [],
      invitation: [],
    }),
    emailAndPassword: {
      ...auth.options.emailAndPassword,
      enabled: true,
      requireEmailVerification: false,
    },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false },
  })
}

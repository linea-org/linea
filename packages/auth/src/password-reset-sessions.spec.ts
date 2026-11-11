import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/reset_test")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "password-reset-session-regression-test-secret"
  )
})
afterAll(() => vi.unstubAllEnvs())

it("invalidates both existing sessions when the password is reset", async () => {
  const { auth } = await import("./auth.js")
  let resetToken = ""
  const isolated = betterAuth({
    ...auth.options,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      member: [],
      organization: [],
    }),
    emailAndPassword: {
      ...auth.options.emailAndPassword,
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ token }) => {
        resetToken = token
      },
    },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false },
  })
  const credentials = {
    email: "reset@example.test",
    password: "OldPasswordRegression123!",
  }
  await isolated.api.signUpEmail({
    body: { ...credentials, name: "Session owner" },
  })
  const sessions = []
  for (let i = 0; i < 2; i++) {
    const response = await isolated.api.signInEmail({
      body: credentials,
      asResponse: true,
    })
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")
    expect(cookie).not.toBe("")
    const headers = new Headers({ cookie })
    expect(await isolated.api.getSession({ headers })).not.toBeNull()
    sessions.push(headers)
  }
  await isolated.api.requestPasswordReset({
    body: { email: credentials.email },
  })
  expect(resetToken).not.toBe("")
  await isolated.api.resetPassword({
    body: { token: resetToken, newPassword: "NewPasswordRegression123!" },
  })
  for (const headers of sessions)
    expect(await isolated.api.getSession({ headers })).toBeNull()
})

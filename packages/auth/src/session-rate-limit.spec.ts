import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/session_test")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  vi.stubEnv("BETTER_AUTH_SECRET", "session-rate-limit-regression-test-secret")
})

afterAll(() => vi.unstubAllEnvs())

it("keeps a valid session readable past the auth request limit while throttling sign-in", async () => {
  const { auth } = await import("./auth.js")
  const isolatedAuth = betterAuth({
    ...auth.options,
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
  })
  const signup = await isolatedAuth.api.signUpEmail({
    body: {
      email: "session-rate-limit@example.test",
      password: "SessionRegressionPassword123!",
      name: "Session regression",
    },
    asResponse: true,
  })
  expect(signup.status).toBe(200)
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")
  expect(cookie).not.toBe("")
  for (let index = 0; index < 105; index += 1) {
    const response = await isolatedAuth.handler(
      new Request("http://localhost:3000/v1/auth/get-session", {
        headers: { cookie, "x-real-ip": "192.0.2.203" },
      })
    )
    expect(response.status, `session check ${index + 1}`).toBe(200)
    expect(await response.json()).toMatchObject({
      user: { email: "session-rate-limit@example.test" },
    })
    const organizations = await isolatedAuth.handler(
      new Request("http://localhost:3000/v1/auth/organization/list", {
        headers: { cookie, "x-real-ip": "192.0.2.203" },
      })
    )
    expect(organizations.status, `workspace check ${index + 1}`).toBe(200)
    expect(await organizations.json()).toEqual([])
  }
  await isolatedAuth.api.signOut({ headers: new Headers({ cookie }) })
  const revoked = await isolatedAuth.handler(
    new Request("http://localhost:3000/v1/auth/get-session", {
      headers: { cookie, "x-real-ip": "192.0.2.203" },
    })
  )
  expect(revoked.status).toBe(200)
  expect(await revoked.json()).toBeNull()
  const statuses: number[] = []
  for (let index = 0; index < 5; index += 1) {
    const response = await isolatedAuth.handler(
      new Request("http://localhost:3000/v1/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": "192.0.2.204",
        },
        body: JSON.stringify({ email: "invalid" }),
      })
    )
    statuses.push(response.status)
  }
  expect(statuses).toContain(429)
}, 30_000)

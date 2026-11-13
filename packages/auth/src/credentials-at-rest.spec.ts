import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

const sentEmails = vi.hoisted((): { to: string; text?: string }[] => [])
vi.mock("./email.js", () => ({
  sendEmail: async (email: { to: string; text?: string }) => {
    sentEmails.push(email)
  },
}))

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/at_rest_test")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  vi.stubEnv("BETTER_AUTH_SECRET", "credentials-at-rest-regression-secret")
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id")
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret")
})

afterAll(() => vi.unstubAllEnvs())

type Row = Record<string, unknown>

async function createIsolatedAuth() {
  const { auth } = await import("./auth.js")
  const tables: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    member: [],
    organization: [],
  }
  let resetToken = ""
  const isolated = betterAuth({
    ...auth.options,
    database: memoryAdapter(tables),
    emailAndPassword: {
      ...auth.options.emailAndPassword,
      requireEmailVerification: false,
      sendResetPassword: async ({ token }) => {
        resetToken = token
      },
    },
    emailVerification: { sendOnSignUp: false, sendOnSignIn: false },
  })
  return { isolated, tables, resetToken: () => resetToken }
}

it("stores password-reset identifiers hashed and still accepts the emailed token", async () => {
  const { isolated, tables, resetToken } = await createIsolatedAuth()
  const credentials = {
    email: "reset-at-rest@example.test",
    password: "OldPasswordAtRest123!",
  }
  await isolated.api.signUpEmail({ body: { ...credentials, name: "Reset" } })
  await isolated.api.requestPasswordReset({
    body: { email: credentials.email },
  })
  const token = resetToken()
  expect(token).not.toBe("")
  expect(tables.verification).toHaveLength(1)
  const identifier = String(tables.verification[0]?.identifier)
  expect(identifier).not.toContain(token)
  expect(identifier).not.toContain("reset-password:")
  await isolated.api.resetPassword({
    body: { token, newPassword: "NewPasswordAtRest123!" },
  })
  const signIn = await isolated.api.signInEmail({
    body: { email: credentials.email, password: "NewPasswordAtRest123!" },
  })
  expect(signIn.token).toBeTruthy()
})

it("stores magic-link identifiers hashed and still signs in with the emailed token", async () => {
  const { isolated, tables } = await createIsolatedAuth()
  const email = "magic-at-rest@example.test"
  await isolated.api.signInMagicLink({
    body: { email },
    headers: new Headers(),
  })
  const sent = sentEmails.find((message) => message.to === email)
  const token = new URL(
    String(sent?.text?.replace("Sign in: ", ""))
  ).searchParams.get("token")
  expect(token).toBeTruthy()
  expect(tables.verification).toHaveLength(1)
  expect(String(tables.verification[0]?.identifier)).not.toContain(
    String(token)
  )
  const response = await isolated.handler(
    new Request(
      `http://localhost:3000/v1/auth/magic-link/verify?token=${token}`
    )
  )
  expect(response.headers.getSetCookie().join(";")).toContain("session_token")
})

it("never stores social provider access, refresh or id tokens", async () => {
  const { isolated, tables } = await createIsolatedAuth()
  const ctx = await isolated.$context
  const tokens = {
    accessToken: "provider-access-token",
    refreshToken: "provider-refresh-token",
    idToken: "provider-id-token",
  }
  const { user, account } = await ctx.internalAdapter.createOAuthUser(
    {
      email: "social-at-rest@example.test",
      name: "Social",
      emailVerified: true,
    },
    {
      providerId: "google",
      accountId: "google-sub",
      scope: "openid",
      ...tokens,
    }
  )
  await ctx.internalAdapter.updateAccount(account.id, tokens)
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "github",
    accountId: "github-id",
    ...tokens,
  })
  expect(tables.account).toHaveLength(2)
  for (const row of tables.account) {
    expect(row.accessToken).toBeNull()
    expect(row.refreshToken).toBeNull()
    expect(row.idToken).toBeNull()
  }
  expect(tables.account[0]?.scope).toBe("openid")
})

it("rejects client-submitted Google id tokens", async () => {
  const { isolated } = await createIsolatedAuth()
  await expect(
    isolated.api.signInSocial({
      body: { provider: "google", idToken: { token: "header.payload.sig" } },
    })
  ).rejects.toThrow("id_token not supported")
})

// GHSA-965c-763c-88jm: with hashed identifiers on better-auth <1.7.7 this redeemed the state as a magic link.
it("does not redeem an OAuth state as a magic-link token", async () => {
  const { isolated, tables } = await createIsolatedAuth()
  await isolated.api.signUpEmail({
    body: {
      email: "victim@example.test",
      password: "VictimPassword123!",
      name: "Victim",
    },
  })
  const sessionsBefore = tables.session.length
  const started = await isolated.api.signInSocial({
    body: {
      provider: "google",
      disableRedirect: true,
      additionalData: { email: "victim@example.test" },
    },
  })
  const state = new URL(String(started.url)).searchParams.get("state")
  expect(state).toBeTruthy()
  expect(
    tables.verification.some((row) =>
      String(row.identifier).includes(String(state))
    )
  ).toBe(false)
  const response = await isolated.handler(
    new Request(
      `http://localhost:3000/v1/auth/magic-link/verify?token=${state}`
    )
  )
  expect(response.headers.get("location")).toContain("INVALID_TOKEN")
  expect(response.headers.getSetCookie()).toEqual([])
  expect(tables.session).toHaveLength(sessionsBefore)
})

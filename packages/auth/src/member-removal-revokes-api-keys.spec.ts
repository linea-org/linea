import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

const revokeApiKeysCreatedBy = vi.fn()

vi.mock("@linea/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@linea/db")>()
  return {
    ...actual,
    repositories: {
      ...actual.repositories,
      apiKey: { ...actual.repositories.apiKey, revokeApiKeysCreatedBy },
    },
  }
})

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/remove_test")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  vi.stubEnv("BETTER_AUTH_SECRET", "member-removal-regression-test-secret")
})
afterAll(() => vi.unstubAllEnvs())

const password = "MemberRemoval123!"

it("revokes the API keys a member minted when they are removed from the workspace", async () => {
  const { auth } = await import("./auth.js")
  const isolated = betterAuth({
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
  await isolated.api.signUpEmail({
    body: { email: "owner@example.test", password, name: "Owner" },
  })
  const admin = await isolated.api.signUpEmail({
    body: { email: "admin@example.test", password, name: "Admin" },
  })
  const signIn = await isolated.api.signInEmail({
    body: { email: "owner@example.test", password },
    asResponse: true,
  })
  const ownerHeaders = new Headers({
    cookie: signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  })
  const organization = await isolated.api.createOrganization({
    body: { name: "Workspace", slug: "workspace" },
    headers: ownerHeaders,
  })
  if (!organization) throw new Error("organization was not created")
  await isolated.api.addMember({
    body: {
      userId: admin.user.id,
      organizationId: organization.id,
      role: "admin",
    },
  })
  expect(revokeApiKeysCreatedBy).not.toHaveBeenCalled()
  await isolated.api.removeMember({
    body: {
      memberIdOrEmail: "admin@example.test",
      organizationId: organization.id,
    },
    headers: ownerHeaders,
  })
  expect(revokeApiKeysCreatedBy).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    organization.id,
    admin.user.id
  )
}, 30_000)

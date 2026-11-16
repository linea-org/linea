import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { betterAuth } from "better-auth"
import { memoryAdapter } from "better-auth/adapters/memory"

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@127.0.0.1:1/personal_test")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  vi.stubEnv("BETTER_AUTH_SECRET", "personal-workspace-regression-secret")
})
afterAll(() => vi.unstubAllEnvs())

const password = "PersonalSpace123!"

async function signedInOwner() {
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
  const signIn = await isolated.api.signInEmail({
    body: { email: "owner@example.test", password },
    asResponse: true,
  })
  const headers = new Headers({
    cookie: signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  })
  return { isolated, headers }
}

it("refuses to delete or invite into a personal workspace, but not to delete a team one", async () => {
  const { isolated, headers } = await signedInOwner()
  const personal = await isolated.api.createOrganization({
    body: {
      name: "Owner's workspace",
      slug: "owner",
      metadata: { personal: true },
    },
    headers,
  })
  const team = await isolated.api.createOrganization({
    body: { name: "Team", slug: "team" },
    headers,
  })
  if (!personal || !team) throw new Error("organizations were not created")

  await expect(
    isolated.api.deleteOrganization({
      body: { organizationId: personal.id },
      headers,
    })
  ).rejects.toThrow("can't be deleted")
  await expect(
    isolated.api.createInvitation({
      body: {
        email: "friend@example.test",
        role: "member",
        organizationId: personal.id,
      },
      headers,
    })
  ).rejects.toThrow("for one person")

  await isolated.api.deleteOrganization({
    body: { organizationId: team.id },
    headers,
  })
})

import { describe, expect, it } from "vitest"
import { createMagicLinkEmailUrl } from "./magic-link-email-url.js"

describe("createMagicLinkEmailUrl", () => {
  it("keeps a native request token on the verified web origin for universal linking", () => {
    const authUrl = new URL(
      "http://localhost:3000/api/auth/magic-link/verify?token=secret-token"
    )
    authUrl.searchParams.set("callbackURL", "linea://workspaces")
    expect(
      createMagicLinkEmailUrl(authUrl.toString(), "http://localhost:3001")
    ).toBe("http://localhost:3001/magic-link?token=secret-token")
  })

  it("keeps web sign-in links on the web app and preserves invitations", () => {
    const authUrl = new URL(
      "http://localhost:3000/api/auth/magic-link/verify?token=secret-token"
    )
    authUrl.searchParams.set(
      "callbackURL",
      "http://localhost:3001/accept-invitation/invitation-1"
    )
    expect(
      createMagicLinkEmailUrl(authUrl.toString(), "http://localhost:3001")
    ).toBe(
      "http://localhost:3001/magic-link?token=secret-token&invitationId=invitation-1"
    )
  })

  it("rejects a generated auth URL without a token", () => {
    expect(() =>
      createMagicLinkEmailUrl(
        "http://localhost:3000/api/auth/magic-link/verify",
        "http://localhost:3001"
      )
    ).toThrow("Auth email link is missing a token")
  })
})

import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

export const apiBaseUrl = "https://api.example"
export const applicationId = "80000000-0000-4000-8000-000000000008"
export const externalSubjectId = "90000000-0000-4000-8000-000000000009"
export const authorizationState = "s".repeat(43)
export const firstNonce = "n".repeat(32)
export const sessionNonce = "o".repeat(32)

export const authorizationHandlers = [
  http.post(`${apiBaseUrl}/v1/user-sessions/authorization`, () =>
    HttpResponse.json(
      {
        authorizationUrl: `https://identity.example/authorize?state=${authorizationState}`,
      },
      { status: 201 }
    )
  ),
  http.post(`${apiBaseUrl}/v1/user-sessions/exchange`, () =>
    HttpResponse.json(
      {
        applicationId,
        externalSubjectId,
        exchangeToken: `lnx_${"e".repeat(32)}`,
        dpopNonce: firstNonce,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      { status: 201 }
    )
  ),
  http.post(`${apiBaseUrl}/v1/user-sessions`, () =>
    HttpResponse.json(
      {
        accessToken: `lnu_${"a".repeat(32)}`,
        tokenType: "DPoP",
        dpopNonce: sessionNonce,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      { status: 201, headers: { "DPoP-Nonce": sessionNonce } }
    )
  ),
]

export const server = setupServer(...authorizationHandlers)

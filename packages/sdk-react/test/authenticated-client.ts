import { LineaUserClient } from "@linea/sdk/user"
import { apiBaseUrl, applicationId, authorizationState } from "./server.js"

export async function authenticatedClient(): Promise<LineaUserClient> {
  const client = new LineaUserClient({
    applicationId,
    baseUrl: apiBaseUrl,
    fetch: (input, init) => fetch(input, { ...init, signal: undefined }),
  })
  await client.startAuthorization({
    redirectUri: "https://app.example/callback",
  })
  await client.completeAuthorization({
    code: "provider-authorization-code",
    state: authorizationState,
  })
  return client
}

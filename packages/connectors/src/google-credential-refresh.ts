import { z } from "zod"
import { readBoundedJsonResponse } from "./bounded-response.js"
import type { ConnectorReadCredential } from "./connector-read-operation.js"
import { googleEndpointUrl } from "./google-endpoint.js"
import { normalizeGoogleGrantedScopes } from "./google-scopes.js"

const storedGoogleCredentialSchema = z
  .object({
    accountId: z.string().min(1),
    accountLabel: z.string().min(1),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.string().datetime().nullable(),
    grantedScopes: z.array(z.string().min(1)).min(1),
  })
  .strip()
const refreshResponseSchema = z
  .object({
    access_token: z.string().min(1).max(8192),
    refresh_token: z.string().min(1).max(8192).optional(),
    expires_in: z.number().int().positive().max(86_400),
    scope: z.string().min(1).max(10_000).optional(),
  })
  .strip()
const errorResponseSchema = z.object({ error: z.string() }).strip()

export type StoredGoogleCredential = z.infer<
  typeof storedGoogleCredentialSchema
>

export class GoogleRefreshInvalidGrantError extends Error {}

export function parseStoredGoogleCredential(
  value: unknown
): StoredGoogleCredential {
  return storedGoogleCredentialSchema.parse(value)
}

export async function refreshGoogleCredential(
  credential: StoredGoogleCredential
): Promise<StoredGoogleCredential> {
  const clientId = process.env.GOOGLE_CONNECTOR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CONNECTOR_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("Google Connector credential refresh is unavailable")
  }
  const response = await fetch(
    googleEndpointUrl(
      process.env.GOOGLE_CONNECTOR_TOKEN_URL ??
        "https://oauth2.googleapis.com/token"
    ),
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: credential.refreshToken,
      }),
    }
  )
  let parsed: unknown
  try {
    parsed = await readBoundedJsonResponse(response, 64_000)
  } catch {
    throw new Error("Google refresh response failed")
  }
  if (!response.ok) {
    const error = errorResponseSchema.safeParse(parsed)
    if (error.success && error.data.error === "invalid_grant") {
      throw new GoogleRefreshInvalidGrantError()
    }
    throw new Error("Google credential refresh failed")
  }
  const token = refreshResponseSchema.parse(parsed)
  return {
    ...credential,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? credential.refreshToken,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    grantedScopes: token.scope
      ? normalizeGoogleGrantedScopes(token.scope)
      : credential.grantedScopes,
  }
}

export function connectorCredential(
  credential: StoredGoogleCredential,
  scopes: readonly string[]
): ConnectorReadCredential {
  return {
    accountId: credential.accountId,
    accessToken: credential.accessToken,
    expiresAt: credential.expiresAt,
    scopes,
  }
}

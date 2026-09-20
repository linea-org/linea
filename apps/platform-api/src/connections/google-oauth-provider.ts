import { googleAuthorizationScopes } from '@linea/connectors'
import { z } from 'zod'
import {
  ConnectionProviderInvalidGrantError,
  type ConnectionOAuthProvider,
  type ConnectionProviderCredential,
} from './connection-oauth-provider'

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1).max(8192),
    refresh_token: z.string().min(1).max(8192).optional(),
    expires_in: z.number().int().positive().max(86_400),
    scope: z.string().min(1).max(10_000).optional(),
  })
  .strip()
const accountResponseSchema = z
  .object({
    sub: z.string().min(1).max(500),
    email: z.string().email().max(500),
    email_verified: z.boolean(),
  })
  .strip()
const errorResponseSchema = z.object({ error: z.string() }).strip()

export type GoogleOAuthProviderConfig = {
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  revocationUrl: string
}

async function responseJson(response: Response): Promise<unknown> {
  const body = await response.text()
  if (body.length > 64_000) throw new Error('Google response exceeded limit')
  return JSON.parse(body) as unknown
}

function scopes(value: string | undefined, fallback: string[]): string[] {
  return [...new Set((value?.split(' ') ?? fallback).filter(Boolean))].sort()
}

export class GoogleOAuthProvider implements ConnectionOAuthProvider {
  readonly provider = 'google'

  constructor(private readonly config: GoogleOAuthProviderConfig) {}

  authorizationScopes(actionFamilies: readonly string[]): readonly string[] {
    return googleAuthorizationScopes(actionFamilies)
  }

  createAuthorizationUrl(input: {
    redirectUri: string
    state: string
    codeChallenge: string
    scopes: string[]
  }): string {
    const url = new URL(this.config.authorizationUrl)
    url.searchParams.set('client_id', this.config.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', input.scopes.join(' '))
    url.searchParams.set('state', input.state)
    url.searchParams.set('code_challenge', input.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('include_granted_scopes', 'false')
    return url.toString()
  }

  async exchangeAuthorizationCode(input: {
    code: string
    redirectUri: string
    codeVerifier: string
  }): Promise<ConnectionProviderCredential> {
    const tokenResponse = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: input.redirectUri,
      }),
    })
    if (!tokenResponse.ok) throw new Error('Google token exchange failed')
    const token = tokenResponseSchema.parse(await responseJson(tokenResponse))
    if (!token.refresh_token || !token.scope) {
      throw new Error('Google token response is incomplete')
    }
    const accountResponse = await fetch(this.config.userInfoUrl, {
      headers: { authorization: `Bearer ${token.access_token}` },
    })
    if (!accountResponse.ok) throw new Error('Google account lookup failed')
    const account = accountResponseSchema.parse(
      await responseJson(accountResponse),
    )
    if (!account.email_verified) {
      throw new Error('Google account email is unverified')
    }
    return {
      accountId: account.sub,
      accountLabel: account.email,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      grantedScopes: scopes(token.scope, []),
    }
  }

  async refreshCredential(
    credential: ConnectionProviderCredential,
  ): Promise<ConnectionProviderCredential> {
    if (!credential.refreshToken) {
      throw new ConnectionProviderInvalidGrantError(
        'Google refresh grant is unavailable',
      )
    }
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: credential.refreshToken,
      }),
    })
    const responseBody = await responseJson(response)
    if (!response.ok) {
      const error = errorResponseSchema.safeParse(responseBody)
      if (error.success && error.data.error === 'invalid_grant') {
        throw new ConnectionProviderInvalidGrantError(
          'Google refresh grant is invalid',
        )
      }
      throw new Error('Google credential refresh failed')
    }
    const token = tokenResponseSchema.parse(responseBody)
    return {
      ...credential,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? credential.refreshToken,
      expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      grantedScopes: scopes(token.scope, credential.grantedScopes),
    }
  }

  async revokeCredential(
    credential: ConnectionProviderCredential,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(this.config.revocationUrl, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: credential.refreshToken ?? credential.accessToken,
      }),
    })
    if (!response.ok) throw new Error('Google credential revocation failed')
  }
}

export function googleOAuthProviderFromEnvironment(): GoogleOAuthProvider | null {
  const clientId = process.env.GOOGLE_CONNECTOR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CONNECTOR_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return new GoogleOAuthProvider({
    clientId,
    clientSecret,
    authorizationUrl:
      process.env.GOOGLE_CONNECTOR_AUTHORIZATION_URL ??
      'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:
      process.env.GOOGLE_CONNECTOR_TOKEN_URL ??
      'https://oauth2.googleapis.com/token',
    userInfoUrl:
      process.env.GOOGLE_CONNECTOR_USERINFO_URL ??
      'https://openidconnect.googleapis.com/v1/userinfo',
    revocationUrl:
      process.env.GOOGLE_CONNECTOR_REVOCATION_URL ??
      'https://oauth2.googleapis.com/revoke',
  })
}

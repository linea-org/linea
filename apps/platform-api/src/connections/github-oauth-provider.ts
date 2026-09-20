import { z } from 'zod'
import {
  ConnectionProviderInvalidGrantError,
  type ConnectionOAuthProvider,
} from './connection-oauth-provider'

type GithubOAuthProviderConfiguration = {
  clientId: string
  clientSecret: string
  oauthBaseUrl: string
  apiBaseUrl: string
}

const githubActionFamilyScopes = {
  repositories: ['read:user'],
  issues: ['repo'],
  pull_requests: ['repo'],
}

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1).max(500),
    refresh_token: z.string().min(1).max(500).optional(),
    expires_in: z.number().int().positive().optional(),
    scope: z.string().max(2_000),
    token_type: z.string().min(1).max(50),
  })
  .passthrough()
const accountResponseSchema = z
  .object({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    login: z.string().min(1).max(100),
  })
  .passthrough()

function normalizedScopes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right))
}

export function githubAuthorizationScopes(actionFamilies: string[]): string[] {
  const scopes = new Set<string>()
  for (const actionFamily of actionFamilies) {
    if (!isGithubActionFamily(actionFamily)) {
      throw new Error('Unsupported GitHub action family')
    }
    for (const scope of githubActionFamilyScopes[actionFamily]) {
      scopes.add(scope)
    }
  }
  if (scopes.size === 0) throw new Error('No GitHub action family is enabled')
  return [...scopes].sort((left, right) => left.localeCompare(right))
}

function isGithubActionFamily(
  value: string,
): value is keyof typeof githubActionFamilyScopes {
  return Object.hasOwn(githubActionFamilyScopes, value)
}

function requireScopes(granted: string[], requested: string[]): void {
  const expected = [...new Set(requested)].sort((left, right) =>
    left.localeCompare(right),
  )
  if (
    granted.length !== expected.length ||
    granted.some((scope, index) => scope !== expected[index])
  ) {
    throw new ConnectionProviderInvalidGrantError(
      'GitHub did not grant the requested scopes',
    )
  }
}

function expiration(expiresIn: number | undefined): string | null {
  return expiresIn
    ? new Date(Date.now() + expiresIn * 1_000).toISOString()
    : null
}

async function githubAccount(
  apiBaseUrl: string,
  accessToken: string,
): Promise<{ accountId: string; accountLabel: string }> {
  try {
    const response = await fetch(new URL('/user', apiBaseUrl), {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': 'Linea-Platform-API',
        'x-github-api-version': '2026-03-10',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error('GitHub account discovery failed')
    const account = accountResponseSchema.parse(await response.json())
    return { accountId: String(account.id), accountLabel: account.login }
  } catch {
    throw new Error('GitHub account discovery failed')
  }
}

async function tokenRequest(
  configuration: GithubOAuthProviderConfiguration,
  parameters: URLSearchParams,
) {
  try {
    const response = await fetch(
      new URL('/login/oauth/access_token', configuration.oauthBaseUrl),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: parameters,
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!response.ok) {
      throw new ConnectionProviderInvalidGrantError('GitHub grant is invalid')
    }
    return tokenResponseSchema.parse(await response.json())
  } catch {
    throw new ConnectionProviderInvalidGrantError('GitHub grant is invalid')
  }
}

export function createGithubOAuthProvider(
  configuration: GithubOAuthProviderConfiguration,
): ConnectionOAuthProvider {
  return Object.freeze<ConnectionOAuthProvider>({
    provider: 'github',
    createAuthorizationUrl(input) {
      const url = new URL('/login/oauth/authorize', configuration.oauthBaseUrl)
      url.searchParams.set('client_id', configuration.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('state', input.state)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set(
        'scope',
        [...input.scopes, 'offline_access'].join(' '),
      )
      return url.toString()
    },
    async exchangeAuthorizationCode(input) {
      const token = await tokenRequest(
        configuration,
        new URLSearchParams({
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
          code_verifier: input.codeVerifier,
        }),
      )
      const grantedScopes = normalizedScopes(token.scope)
      requireScopes(grantedScopes, input.scopes)
      const account = await githubAccount(
        configuration.apiBaseUrl,
        token.access_token,
      )
      return {
        ...account,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: expiration(token.expires_in),
        grantedScopes,
      }
    },
    async refreshCredential(credential) {
      if (!credential.refreshToken) {
        throw new ConnectionProviderInvalidGrantError(
          'GitHub refresh token is unavailable',
        )
      }
      const token = await tokenRequest(
        configuration,
        new URLSearchParams({
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: credential.refreshToken,
        }),
      )
      const grantedScopes = normalizedScopes(token.scope)
      requireScopes(grantedScopes, credential.grantedScopes)
      const account = await githubAccount(
        configuration.apiBaseUrl,
        token.access_token,
      )
      if (account.accountId !== credential.accountId) {
        throw new ConnectionProviderInvalidGrantError(
          'GitHub account identity changed',
        )
      }
      return {
        ...account,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? credential.refreshToken,
        expiresAt: expiration(token.expires_in),
        grantedScopes,
      }
    },
    async revokeCredential(credential, signal) {
      const response = await fetch(
        new URL(
          `/applications/${encodeURIComponent(configuration.clientId)}/token`,
          configuration.apiBaseUrl,
        ),
        {
          method: 'DELETE',
          signal,
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Basic ${Buffer.from(
              `${configuration.clientId}:${configuration.clientSecret}`,
            ).toString('base64')}`,
            'content-type': 'application/json',
            'user-agent': 'Linea-Platform-API',
            'x-github-api-version': '2026-03-10',
          },
          body: JSON.stringify({ access_token: credential.accessToken }),
        },
      )
      if (!response.ok) throw new Error('GitHub credential revocation failed')
    },
  })
}

export function githubOAuthProviderFromEnvironment():
  | ConnectionOAuthProvider
  | undefined {
  const clientId = process.env.CONNECTION_GITHUB_CLIENT_ID
  const clientSecret = process.env.CONNECTION_GITHUB_CLIENT_SECRET
  if (!clientId && !clientSecret) return undefined
  if (!clientId || !clientSecret) {
    throw new Error(
      'CONNECTION_GITHUB_CLIENT_ID and CONNECTION_GITHUB_CLIENT_SECRET are both required',
    )
  }
  return createGithubOAuthProvider({
    clientId,
    clientSecret,
    oauthBaseUrl: 'https://github.com',
    apiBaseUrl: 'https://api.github.com',
  })
}

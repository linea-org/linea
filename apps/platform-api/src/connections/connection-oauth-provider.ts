export type CreateConnectionAuthorizationUrlInput = {
  redirectUri: string
  state: string
  codeChallenge: string
  scopes: string[]
}

export type ExchangeConnectionAuthorizationCodeInput = {
  code: string
  redirectUri: string
  codeVerifier: string
}

export type ConnectionProviderCredential = {
  accountId: string
  accountLabel: string
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
}

export type ConnectionAuthorizationCredential = ConnectionProviderCredential & {
  grantedScopes: string[]
}

export interface ConnectionOAuthProvider {
  readonly provider: string
  createAuthorizationUrl(
    input: CreateConnectionAuthorizationUrlInput,
  ): Promise<string> | string
  exchangeAuthorizationCode(
    input: ExchangeConnectionAuthorizationCodeInput,
  ): Promise<ConnectionAuthorizationCredential>
  refreshCredential(
    credential: ConnectionProviderCredential,
  ): Promise<ConnectionProviderCredential>
  revokeCredential(
    credential: ConnectionProviderCredential,
    signal: AbortSignal,
  ): Promise<void>
}

export class ConnectionProviderInvalidGrantError extends Error {}

export const CONNECTION_OAUTH_PROVIDERS = Symbol('CONNECTION_OAUTH_PROVIDERS')

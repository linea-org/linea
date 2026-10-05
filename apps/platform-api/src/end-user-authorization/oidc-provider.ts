export type OidcEnvironmentConfiguration = {
  environment: 'dev' | 'production'
  issuer: string
  clientId: string
  audience: string
  jwksUrl: string
  subjectClaim: string
}

export interface OidcProvider {
  createAuthorizationUrl(
    configuration: OidcEnvironmentConfiguration,
    input: {
      redirectUri: string
      codeChallenge: string
      state: string
      nonce: string
    },
  ): Promise<string>
  exchangeAuthorizationCode(
    configuration: OidcEnvironmentConfiguration,
    input: {
      redirectUri: string
      code: string
      codeVerifier: string
      nonceHash: string
    },
  ): Promise<{ issuerSubject: string }>
}

export const OIDC_PROVIDER = Symbol('OIDC_PROVIDER')

export class OidcIdentityVerificationError extends Error {}

export class OidcProviderUnavailableError extends Error {}

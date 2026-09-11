import { createHash, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
} from 'jose-v5'
import { z } from 'zod'
import {
  OidcIdentityVerificationError,
  OidcProviderUnavailableError,
  type OidcApplicationConfiguration,
  type OidcProvider,
} from './oidc-provider'

const discoverySchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
})

const tokenResponseSchema = z.object({ id_token: z.string().min(1) })

type Discovery = z.infer<typeof discoverySchema>

function discoveryUrl(issuer: string): URL {
  const url = new URL(issuer)
  const issuerPath = url.pathname.replace(/\/$/, '')
  url.pathname = `${issuerPath}/.well-known/openid-configuration`
  url.search = ''
  url.hash = ''
  return url
}

function hash(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function assertHttps(configuration: OidcApplicationConfiguration, url: string) {
  if (
    configuration.environment === 'production' &&
    new URL(url).protocol !== 'https:'
  ) {
    throw new OidcProviderUnavailableError()
  }
}

function verifyNonce(payload: JWTPayload, expectedHash: string): void {
  if (typeof payload.nonce !== 'string')
    throw new Error('ID token nonce missing')
  const actual = hash(payload.nonce)
  const expected = Buffer.from(expectedHash, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('ID token nonce mismatch')
  }
}

function verifyAuthorizedParty(
  payload: JWTPayload,
  configuration: OidcApplicationConfiguration,
): void {
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(configuration.audience)) {
    throw new Error('ID token audience mismatch')
  }
  if (
    (audiences.length > 1 || payload.azp !== undefined) &&
    payload.azp !== configuration.clientId
  ) {
    throw new Error('ID token authorized party mismatch')
  }
}

@Injectable()
export class RemoteOidcProvider implements OidcProvider {
  private readonly discoveryCache = new Map<
    string,
    { value: Discovery; expiresAt: number }
  >()
  private readonly jwksCache = new Map<
    string,
    ReturnType<typeof createRemoteJWKSet>
  >()

  async createAuthorizationUrl(
    configuration: OidcApplicationConfiguration,
    input: {
      redirectUri: string
      codeChallenge: string
      state: string
      nonce: string
    },
  ): Promise<string> {
    const discovery = await this.discover(configuration)
    const url = new URL(discovery.authorization_endpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', configuration.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('scope', 'openid')
    url.searchParams.set('state', input.state)
    url.searchParams.set('nonce', input.nonce)
    url.searchParams.set('code_challenge', input.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('audience', configuration.audience)
    return url.toString()
  }

  async exchangeAuthorizationCode(
    configuration: OidcApplicationConfiguration,
    input: {
      redirectUri: string
      code: string
      codeVerifier: string
      nonceHash: string
    },
  ): Promise<{ issuerSubject: string }> {
    const discovery = await this.discover(configuration)
    let response: Response
    try {
      response = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: configuration.clientId,
          redirect_uri: input.redirectUri,
          code: input.code,
          code_verifier: input.codeVerifier,
        }),
        signal: AbortSignal.timeout(5_000),
      })
    } catch {
      throw new OidcProviderUnavailableError()
    }
    if (response.status === 429 || response.status >= 500) {
      throw new OidcProviderUnavailableError()
    }
    if (!response.ok) throw new OidcIdentityVerificationError()
    let tokenResponse: z.infer<typeof tokenResponseSchema>
    try {
      tokenResponse = tokenResponseSchema.parse(await response.json())
    } catch {
      throw new OidcIdentityVerificationError()
    }
    const jwks =
      this.jwksCache.get(configuration.jwksUrl) ??
      createRemoteJWKSet(new URL(configuration.jwksUrl), {
        timeoutDuration: 5_000,
        cooldownDuration: 0,
        cacheMaxAge: 300_000,
      })
    this.jwksCache.set(configuration.jwksUrl, jwks)
    try {
      const { payload } = await jwtVerify(tokenResponse.id_token, jwks, {
        issuer: configuration.issuer,
        audience: configuration.clientId,
        algorithms: [
          'RS256',
          'RS384',
          'RS512',
          'PS256',
          'PS384',
          'PS512',
          'ES256',
          'ES384',
          'ES512',
          'EdDSA',
        ],
      })
      if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
        throw new OidcIdentityVerificationError()
      }
      verifyNonce(payload, input.nonceHash)
      verifyAuthorizedParty(payload, configuration)
      const issuerSubject = payload[configuration.subjectClaim]
      if (typeof issuerSubject !== 'string' || issuerSubject.length === 0) {
        throw new OidcIdentityVerificationError()
      }
      return { issuerSubject }
    } catch (error) {
      if (error instanceof OidcIdentityVerificationError) throw error
      if (
        error instanceof TypeError ||
        error instanceof joseErrors.JWKSTimeout
      ) {
        throw new OidcProviderUnavailableError()
      }
      throw new OidcIdentityVerificationError()
    }
  }

  private async discover(
    configuration: OidcApplicationConfiguration,
  ): Promise<Discovery> {
    const cached = this.discoveryCache.get(configuration.issuer)
    if (cached && cached.expiresAt > Date.now()) {
      this.validateDiscovery(configuration, cached.value)
      return cached.value
    }
    try {
      const response = await fetch(discoveryUrl(configuration.issuer), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) throw new Error()
      const discovery = discoverySchema.parse(await response.json())
      this.validateDiscovery(configuration, discovery)
      this.discoveryCache.set(configuration.issuer, {
        value: discovery,
        expiresAt: Date.now() + 300_000,
      })
      return discovery
    } catch {
      throw new OidcProviderUnavailableError()
    }
  }

  private validateDiscovery(
    configuration: OidcApplicationConfiguration,
    discovery: Discovery,
  ): void {
    if (
      discovery.issuer !== configuration.issuer ||
      discovery.jwks_uri !== configuration.jwksUrl
    ) {
      throw new OidcProviderUnavailableError()
    }
    assertHttps(configuration, discovery.authorization_endpoint)
    assertHttps(configuration, discovery.token_endpoint)
    assertHttps(configuration, discovery.jwks_uri)
  }
}

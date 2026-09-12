import { createHash, randomBytes } from 'node:crypto'
import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type {
  EndUserAuthorizationResponse,
  EndUserIdentityExchange,
  ExchangeEndUserAuthorization,
  StartEndUserAuthorization,
} from '@linea/protocol/resources'
import { publicError } from '../auth/public-error'
import {
  OIDC_PROVIDER,
  OidcIdentityVerificationError,
  OidcProviderUnavailableError,
  type OidcApplicationConfiguration,
  type OidcProvider,
} from './oidc-provider'

const AUTHORIZATION_LIFETIME_MS = 5 * 60 * 1000
const IDENTITY_EXCHANGE_LIFETIME_MS = 2 * 60 * 1000
const AUTHORIZATION_CLAIM_LIFETIME_MS = 30 * 1000
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMITS = {
  authorization: { ip: 30, application: 300 },
  exchange: { ip: 60, application: 600 },
}

function opaqueValue(): string {
  return randomBytes(32).toString('base64url')
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function codeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function origin(value: string): string {
  const url = new URL(value)
  return url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin
}

function normalizeBrowserOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return origin(value)
  } catch {
    return '__invalid_origin__'
  }
}

function configuration(application: {
  environment: 'dev' | 'production'
  oidcIssuer: string
  oidcClientId: string
  oidcAudience: string
  oidcJwksUrl: string
  oidcSubjectClaim: string
}): OidcApplicationConfiguration {
  return {
    environment: application.environment,
    issuer: application.oidcIssuer,
    clientId: application.oidcClientId,
    audience: application.oidcAudience,
    jwksUrl: application.oidcJwksUrl,
    subjectClaim: application.oidcSubjectClaim,
  }
}

@Injectable()
export class EndUserAuthorizationService {
  constructor(@Inject(OIDC_PROVIDER) private readonly provider: OidcProvider) {}

  async start(
    input: StartEndUserAuthorization,
    browserOrigin: string | undefined,
    clientIp: string,
  ): Promise<EndUserAuthorizationResponse> {
    await this.enforceRateLimit('authorization', input.applicationId, clientIp)
    const state = opaqueValue()
    const nonce = opaqueValue()
    const result =
      await repositories.endUserAuthorization.createAuthorizationRequest(db, {
        applicationId: input.applicationId,
        redirectUri: input.redirectUri,
        redirectOrigin: origin(input.redirectUri),
        browserOrigin: normalizeBrowserOrigin(browserOrigin),
        stateHash: hash(state),
        nonceHash: hash(nonce),
        codeChallenge: input.codeChallenge,
        expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
      })
    if (result.outcome !== 'created') this.throwInvalidExchange()
    try {
      return {
        authorizationUrl: await this.provider.createAuthorizationUrl(
          configuration(result.application),
          {
            redirectUri: input.redirectUri,
            codeChallenge: input.codeChallenge,
            state,
            nonce,
          },
        ),
      }
    } catch (error) {
      this.throwProviderError(error)
    }
  }

  async exchange(
    input: ExchangeEndUserAuthorization,
    browserOrigin: string | undefined,
    clientIp: string,
  ): Promise<EndUserIdentityExchange> {
    await this.enforceRateLimit('exchange', input.applicationId, clientIp)
    const now = new Date()
    let consumed: Awaited<
      ReturnType<
        typeof repositories.endUserAuthorization.consumeAuthorizationRequest
      >
    >
    try {
      consumed =
        await repositories.endUserAuthorization.consumeAuthorizationRequest(
          db,
          {
            applicationId: input.applicationId,
            redirectUri: input.redirectUri,
            browserOrigin: normalizeBrowserOrigin(browserOrigin),
            stateHash: hash(input.state),
            codeChallenge: codeChallenge(input.codeVerifier),
            authorizationCodeHash: hash(input.code),
            codeVerifierHash: hash(input.codeVerifier),
            now,
            claimExpiredBefore: new Date(
              now.getTime() - AUTHORIZATION_CLAIM_LIFETIME_MS,
            ),
          },
        )
    } catch {
      this.throwInvalidExchange()
    }
    if (consumed.outcome !== 'consumed') this.throwInvalidExchange()
    let identity: { issuerSubject: string }
    try {
      identity = await this.provider.exchangeAuthorizationCode(
        configuration(consumed.application),
        {
          redirectUri: input.redirectUri,
          code: input.code,
          codeVerifier: input.codeVerifier,
          nonceHash: consumed.request.nonceHash,
        },
      )
    } catch (error) {
      if (error instanceof OidcProviderUnavailableError) {
        await repositories.endUserAuthorization.releaseAuthorizationRequestClaim(
          db,
          consumed.request.id,
          now,
        )
      }
      this.throwProviderError(error)
    }
    const exchangeToken = `lnx_${opaqueValue()}`
    const dpopNonce = opaqueValue()
    const expiresAt = new Date(Date.now() + IDENTITY_EXCHANGE_LIFETIME_MS)
    const completed =
      await repositories.endUserAuthorization.completeAuthorizationRequest(db, {
        authorizationRequestId: consumed.request.id,
        issuerSubject: identity.issuerSubject,
        exchangeTokenHash: hash(exchangeToken),
        dpopNonceHash: hash(dpopNonce),
        exchangeExpiresAt: expiresAt,
        now: new Date(),
        claimedAt: now,
      })
    if (completed.outcome !== 'completed') this.throwInvalidExchange()
    return {
      applicationId: completed.applicationId,
      externalSubjectId: completed.externalSubjectId,
      exchangeToken,
      dpopNonce,
      expiresAt: completed.exchange.expiresAt.toISOString(),
    }
  }

  private throwInvalidExchange(): never {
    throw new UnauthorizedException(
      publicError('identity_exchange_failed', 'Identity exchange failed'),
    )
  }

  private async enforceRateLimit(
    operation: keyof typeof RATE_LIMITS,
    applicationId: string,
    clientIp: string,
  ): Promise<void> {
    const bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)
    const limits = RATE_LIMITS[operation]
    const allowed =
      await repositories.endUserAuthorization.consumeAuthorizationRateLimits(
        db,
        [
          {
            key: hash(`${operation}:ip:${clientIp}:${bucket}`),
            limit: limits.ip,
          },
          {
            key: hash(`${operation}:application:${applicationId}:${bucket}`),
            limit: limits.application,
          },
        ],
        new Date((bucket + 2) * RATE_LIMIT_WINDOW_MS),
      )
    if (!allowed) {
      throw new HttpException(
        publicError('rate_limited', 'Too many requests'),
        429,
      )
    }
  }

  private throwProviderError(error: unknown): never {
    if (error instanceof OidcProviderUnavailableError) {
      throw new ServiceUnavailableException(
        publicError(
          'identity_provider_unavailable',
          'Identity provider is temporarily unavailable',
        ),
      )
    }
    if (error instanceof OidcIdentityVerificationError) {
      this.throwInvalidExchange()
    }
    throw error
  }
}

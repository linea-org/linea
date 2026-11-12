import { createHash, randomBytes } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type {
  CreateEndUserSession,
  EndUserSessionCredential,
} from '@linea/protocol/resources'
import { PublicRuntimeRateLimitException } from '../public-runtime/public-runtime-rate-limit.filter'
import { publicError } from '../auth/public-error'
import { DpopProofError, verifyDpopProof } from './dpop-proof'

const SESSION_LIFETIME_MS = 15 * 60 * 1000
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const SESSION_CREATION_LIMIT = 10

function opaqueValue(): string {
  return randomBytes(32).toString('base64url')
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value).origin
  } catch {
    return '__invalid_origin__'
  }
}

@Injectable()
export class EndUserSessionService {
  async create(
    input: CreateEndUserSession,
    proof: string,
    method: string,
    targetUrl: string,
    browserOrigin: string | undefined,
    clientIp: string,
  ): Promise<EndUserSessionCredential> {
    const now = new Date()
    await this.enforceRateLimit('ip', clientIp, now, db)
    const tokenHash = hash(input.exchangeToken)
    const result = await repositories.endUserSession.findIdentityExchange(
      db,
      tokenHash,
      now,
    )
    if (!result) this.throwIdentityExchangeFailed()
    if (!result.exchange.dpopNonceHash) this.throwIdentityExchangeFailed()
    const normalizedOrigin = normalizeOrigin(browserOrigin)
    if (
      normalizedOrigin !== undefined &&
      !result.allowedBrowserOrigins.includes(normalizedOrigin)
    ) {
      this.throwIdentityExchangeFailed()
    }
    let verified: Awaited<ReturnType<typeof verifyDpopProof>>
    try {
      verified = await verifyDpopProof({
        proof,
        method,
        targetUrl,
        nonceHash: result.exchange.dpopNonceHash,
        accessToken: undefined,
        expectedJkt: undefined,
        now,
      })
    } catch (error) {
      if (error instanceof DpopProofError) this.throwInvalidProof()
      throw error
    }
    const accessToken = `lnu_${opaqueValue()}`
    const dpopNonce = opaqueValue()
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS)
    const session = await db.transaction(async (tx) => {
      const created = await repositories.endUserSession.createEndUserSession(
        tx,
        {
          exchangeId: result.exchange.id,
          exchangeTokenHash: tokenHash,
          workspaceId: result.exchange.workspaceId,
          environmentId: result.exchange.environmentId,
          externalSubjectId: result.exchange.externalSubjectId,
          tokenHash: hash(accessToken),
          proofJkt: verified.jkt,
          nonceHash: hash(dpopNonce),
          expiresAt,
          now,
        },
      )
      if (!created) this.throwIdentityExchangeFailed()
      await this.enforceRateLimit(
        'subject',
        `${result.exchange.environmentId}:${result.exchange.externalSubjectId}`,
        now,
        tx,
      )
      return created
    })
    return {
      accessToken,
      tokenType: 'DPoP',
      dpopNonce,
      expiresAt: session.expiresAt.toISOString(),
    }
  }

  async revoke(sessionId: string): Promise<void> {
    await repositories.endUserSession.revokeEndUserSession(
      db,
      sessionId,
      new Date(),
    )
  }

  private async enforceRateLimit(
    dimension: 'ip' | 'subject',
    value: string,
    now: Date,
    client: Parameters<
      typeof repositories.endUserAuthorization.consumeAuthorizationRateLimits
    >[0],
  ): Promise<void> {
    const bucket = Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS)
    const allowed =
      await repositories.endUserAuthorization.consumeAuthorizationRateLimits(
        client,
        [
          {
            key: hash(`session:${dimension}:${value}:${bucket}`),
            limit: SESSION_CREATION_LIMIT,
          },
        ],
        new Date((bucket + 2) * RATE_LIMIT_WINDOW_MS),
      )
    if (!allowed) {
      throw new PublicRuntimeRateLimitException(
        SESSION_CREATION_LIMIT,
        new Date((bucket + 1) * RATE_LIMIT_WINDOW_MS),
      )
    }
  }

  private throwIdentityExchangeFailed(): never {
    throw new UnauthorizedException(
      publicError('identity_exchange_failed', 'Identity exchange failed'),
    )
  }

  private throwInvalidProof(): never {
    throw new UnauthorizedException(
      publicError('proof_invalid', 'DPoP proof is invalid'),
    )
  }
}

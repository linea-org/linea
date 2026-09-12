import { createHash, randomBytes } from 'node:crypto'
import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type {
  CreateEndUserSession,
  EndUserSessionCredential,
} from '@linea/protocol/resources'
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
    await this.enforceRateLimit('ip', clientIp, now)
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
    await this.enforceRateLimit(
      'application',
      result.exchange.applicationId,
      now,
    )
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
    const session = await repositories.endUserSession.createEndUserSession(db, {
      exchangeId: result.exchange.id,
      exchangeTokenHash: tokenHash,
      tokenHash: hash(accessToken),
      proofJkt: verified.jkt,
      nonceHash: hash(dpopNonce),
      expiresAt,
      now,
    })
    if (!session) this.throwIdentityExchangeFailed()
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
    dimension: 'ip' | 'application',
    value: string,
    now: Date,
  ): Promise<void> {
    const bucket = Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS)
    const allowed =
      await repositories.endUserAuthorization.consumeAuthorizationRateLimits(
        db,
        [
          {
            key: hash(`session:${dimension}:${value}:${bucket}`),
            limit: SESSION_CREATION_LIMIT,
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

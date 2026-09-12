import { createHash } from 'node:crypto'
import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { Request } from 'express'
import { publicError } from '../auth/public-error'
import {
  DpopProofError,
  readDpopProof,
  requestTarget,
  verifyDpopProof,
} from './dpop-proof'

export type EndUserPrincipal = {
  sessionId: string
  workspaceId: string
  applicationId: string
  externalSubjectId: string
}

export type EndUserAuthenticatedRequest = Request & {
  endUserPrincipal?: EndUserPrincipal
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizedOrigin(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return '__invalid_origin__'
  }
}

@Injectable()
export class EndUserSessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<EndUserAuthenticatedRequest>()
    const authorizationHeaders = request.rawHeaders.filter(
      (value, index) =>
        index % 2 === 0 && value.toLowerCase() === 'authorization',
    )
    const authorization = request.headers.authorization
    const accessToken =
      authorizationHeaders.length === 1 &&
      authorization?.startsWith('DPoP lnu_')
        ? authorization.slice('DPoP '.length)
        : undefined
    if (
      !accessToken ||
      accessToken.length > 256 ||
      !/^lnu_[A-Za-z0-9_-]+$/.test(accessToken)
    ) {
      this.throwAuthenticationFailed()
    }
    const state = await repositories.endUserSession.findEndUserSession(
      db,
      hash(accessToken),
    )
    if (!state) this.throwAuthenticationFailed()
    const now = new Date()
    if (state.session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException(
        publicError('session_expired', 'End-user session expired'),
      )
    }
    if (
      state.session.revokedAt ||
      !state.applicationEnabled ||
      state.subjectStatus !== 'verified'
    ) {
      throw new UnauthorizedException(
        publicError('session_revoked', 'End-user session revoked'),
      )
    }
    const origin = request.headers.origin
    if (
      typeof origin === 'string' &&
      !state.allowedBrowserOrigins.includes(normalizedOrigin(origin))
    ) {
      this.throwAuthenticationFailed()
    }
    let verified: Awaited<ReturnType<typeof verifyDpopProof>>
    try {
      verified = await verifyDpopProof({
        proof: readDpopProof(request),
        method: request.method,
        targetUrl: requestTarget(request),
        nonceHash: state.session.nonceHash,
        accessToken,
        expectedJkt: state.session.proofJkt,
        now,
      })
    } catch (error) {
      if (error instanceof DpopProofError) this.throwInvalidProof()
      throw error
    }
    const recorded =
      await repositories.endUserSession.recordEndUserSessionProof(db, {
        sessionId: state.session.id,
        jtiHash: verified.jtiHash,
        now,
      })
    if (!recorded) this.throwInvalidProof()
    request.endUserPrincipal = {
      sessionId: state.session.id,
      workspaceId: state.session.workspaceId,
      applicationId: state.session.applicationId,
      externalSubjectId: state.session.externalSubjectId,
    }
    return true
  }

  private throwAuthenticationFailed(): never {
    throw new UnauthorizedException(
      publicError('authentication_failed', 'End-user authentication failed'),
    )
  }

  private throwInvalidProof(): never {
    throw new UnauthorizedException(
      publicError('proof_invalid', 'DPoP proof is invalid'),
    )
  }
}

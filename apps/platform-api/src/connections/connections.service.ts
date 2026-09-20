import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  db,
  decryptCredential,
  encryptCredential,
  repositories,
  type Connection as StoredConnection,
  type ConnectionAuthorizationRequest as StoredConnectionAuthorizationRequest,
} from '@linea/db'
import { connectionStatusSchema } from '@linea/protocol/resources'
import type {
  Connection as PublicConnection,
  ConnectionAuthorizationResponse,
  ConnectionOAuthCallback,
  StartConnectionAuthorization,
} from '@linea/protocol/resources'
import { publicError } from '../auth/public-error'
import type { EndUserPrincipal } from '../end-user-sessions/end-user-session.guard'
import {
  CONNECTION_OAUTH_PROVIDERS,
  type ConnectionOAuthProvider,
} from './connection-oauth-provider'
import { parseConnectionProviderCredential } from './connection-provider-credential'

const AUTHORIZATION_LIFETIME_MS = 5 * 60 * 1000
const REVOCATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

function opaqueValue(): string {
  return randomBytes(32).toString('base64url')
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function challenge(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

function callbackUrl(provider: string): string {
  const baseUrl = process.env.CONNECTION_OAUTH_CALLBACK_BASE_URL
  if (!baseUrl) {
    throw new Error('CONNECTION_OAUTH_CALLBACK_BASE_URL is required')
  }
  return new URL(
    `/v1/user/connections/oauth/${encodeURIComponent(provider)}/callback`,
    baseUrl,
  ).toString()
}

function authorizationResultUrl(
  request: StoredConnectionAuthorizationRequest,
  status: 'connected' | 'failed',
): string {
  const returnUrl = new URL(request.returnUri)
  returnUrl.searchParams.set('authorizationId', request.id)
  returnUrl.searchParams.set('status', status)
  return returnUrl.toString()
}

function publicConnection(connection: StoredConnection): PublicConnection {
  return {
    id: connection.id,
    provider: connection.provider,
    providerAccountId: connection.providerAccountId,
    accountLabel: connection.accountLabel,
    status: connectionStatusSchema.parse(connection.status),
    scopes: connection.scopes,
    credentialVersion: connection.credentialVersion,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    revokedAt: connection.revokedAt?.toISOString() ?? null,
  }
}

@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(CONNECTION_OAUTH_PROVIDERS)
    private readonly providers: readonly ConnectionOAuthProvider[],
  ) {}

  async startAuthorization(
    principal: EndUserPrincipal,
    input: StartConnectionAuthorization,
  ): Promise<ConnectionAuthorizationResponse> {
    const provider = this.providers.find(
      (candidate) => candidate.provider === input.provider,
    )
    if (!provider) {
      throw new ServiceUnavailableException(
        publicError('service_unavailable', 'Connection provider unavailable'),
      )
    }
    const policy =
      await repositories.connection.getConnectionAuthorizationPolicy(db, {
        workspaceId: principal.workspaceId,
        applicationId: principal.applicationId,
        externalSubjectId: principal.externalSubjectId,
        provider: input.provider,
      })
    if (!policy) {
      throw new ForbiddenException(
        publicError('scope_denied', 'Connection authorization denied'),
      )
    }
    let scopes: string[]
    try {
      scopes = [
        ...new Set(provider.authorizationScopes(policy.actionFamilies)),
      ].sort((left, right) => left.localeCompare(right))
      if (
        scopes.length === 0 ||
        scopes.some((scope) => !policy.maxScopes.includes(scope))
      ) {
        throw new Error('Provider scopes exceed policy')
      }
    } catch {
      throw new ForbiddenException(
        publicError('scope_denied', 'Connection authorization denied'),
      )
    }
    const id = randomUUID()
    const state = opaqueValue()
    const codeVerifier = opaqueValue()
    const result =
      await repositories.connection.createConnectionAuthorizationRequest(db, {
        id,
        workspaceId: principal.workspaceId,
        applicationId: principal.applicationId,
        externalSubjectId: principal.externalSubjectId,
        endUserSessionId: principal.sessionId,
        provider: input.provider,
        actionFamilies: policy.actionFamilies,
        scopes,
        returnUri: input.returnUri,
        stateHash: hash(state),
        codeVerifierEncrypted: encryptCredential(codeVerifier, {
          workspaceId: principal.workspaceId,
          applicationId: principal.applicationId,
          externalSubjectId: principal.externalSubjectId,
          recordId: id,
          provider: input.provider,
        }),
        expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
      })
    if (result.outcome === 'application_unavailable') {
      throw new ServiceUnavailableException(
        publicError('service_unavailable', 'Application unavailable'),
      )
    }
    if (result.outcome !== 'created') {
      throw new ForbiddenException(
        publicError('scope_denied', 'Connection authorization denied'),
      )
    }
    return {
      authorizationId: result.request.id,
      authorizationUrl: await provider.createAuthorizationUrl({
        redirectUri: callbackUrl(input.provider),
        state,
        codeChallenge: challenge(codeVerifier),
        scopes,
      }),
    }
  }

  async completeAuthorization(
    providerName: string,
    input: ConnectionOAuthCallback,
  ): Promise<string> {
    const provider = this.providers.find(
      (candidate) => candidate.provider === providerName,
    )
    if (!provider) throw new BadRequestException('Invalid authorization')
    const claimedAt = new Date()
    const claimed =
      await repositories.connection.claimConnectionAuthorizationRequest(db, {
        provider: providerName,
        stateHash: hash(input.state),
        now: claimedAt,
      })
    if (claimed.outcome !== 'claimed') {
      throw new BadRequestException('Invalid authorization')
    }
    const request = claimed.request
    try {
      const context = {
        workspaceId: request.workspaceId,
        applicationId: request.applicationId,
        externalSubjectId: request.externalSubjectId,
        recordId: request.id,
        provider: request.provider,
      }
      if ('error' in input) return authorizationResultUrl(request, 'failed')
      const policy =
        await repositories.connection.getConnectionAuthorizationPolicy(db, {
          workspaceId: request.workspaceId,
          applicationId: request.applicationId,
          externalSubjectId: request.externalSubjectId,
          provider: providerName,
        })
      if (!policy) return authorizationResultUrl(request, 'failed')
      const currentScopes = [
        ...new Set(provider.authorizationScopes(policy.actionFamilies)),
      ].sort((left, right) => left.localeCompare(right))
      if (
        currentScopes.length !== request.scopes.length ||
        currentScopes.some((scope, index) => scope !== request.scopes[index])
      ) {
        return authorizationResultUrl(request, 'failed')
      }
      const credential = await provider.exchangeAuthorizationCode({
        code: input.code,
        redirectUri: callbackUrl(providerName),
        codeVerifier: decryptCredential(request.codeVerifierEncrypted, context),
      })
      const connectionId = randomUUID()
      const completed =
        await repositories.connection.completeConnectionAuthorizationRequest(
          db,
          {
            authorizationRequestId: request.id,
            claimedAt,
            connectionId,
            providerAccountId: credential.accountId,
            accountLabel: credential.accountLabel,
            credentialPlaintext: JSON.stringify(credential),
            grantedScopes: credential.grantedScopes,
            actionFamilies: policy.actionFamilies,
            now: new Date(),
          },
        )
      if (completed.outcome !== 'completed') {
        await provider
          .revokeCredential(credential, AbortSignal.timeout(5_000))
          .catch(() => undefined)
        return authorizationResultUrl(request, 'failed')
      }
      return authorizationResultUrl(request, 'connected')
    } catch {
      return authorizationResultUrl(request, 'failed')
    }
  }

  async list(
    principal: EndUserPrincipal,
  ): Promise<{ data: PublicConnection[] }> {
    const connections = await repositories.connection.listConnections(
      db,
      principal,
    )
    return { data: connections.map(publicConnection) }
  }

  async get(
    principal: EndUserPrincipal,
    connectionId: string,
  ): Promise<PublicConnection> {
    const connection = await repositories.connection.getConnection(
      db,
      principal,
      connectionId,
    )
    if (!connection) {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    return publicConnection(connection)
  }

  async revoke(
    principal: EndUserPrincipal,
    connectionId: string,
  ): Promise<PublicConnection> {
    const current = await repositories.connection.getConnection(
      db,
      principal,
      connectionId,
    )
    if (!current?.credentialEncrypted || current.status !== 'active') {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    const credential = parseConnectionProviderCredential(
      decryptCredential(current.credentialEncrypted, {
        workspaceId: current.workspaceId,
        applicationId: current.applicationId,
        externalSubjectId: current.externalSubjectId,
        recordId: current.id,
        provider: current.provider,
      }),
    )
    const deliveryId = randomUUID()
    const now = new Date()
    const revoked = await repositories.connection.revokeConnection(
      db,
      principal,
      connectionId,
      {
        expectedCredentialVersion: current.credentialVersion,
        deliveryId,
        revocationCredentialEncrypted: encryptCredential(
          JSON.stringify(credential),
          {
            workspaceId: current.workspaceId,
            applicationId: current.applicationId,
            externalSubjectId: current.externalSubjectId,
            recordId: deliveryId,
            provider: `${current.provider}:revocation`,
          },
        ),
        actorEndUserSessionId: principal.sessionId,
        expiresAt: new Date(now.getTime() + REVOCATION_LIFETIME_MS),
        now,
      },
    )
    if (revoked.outcome === 'not_found') {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    if (revoked.outcome === 'conflict') {
      throw new ServiceUnavailableException(
        publicError('service_unavailable', 'Connection changed; retry revoke'),
      )
    }
    return publicConnection(revoked.connection)
  }
}

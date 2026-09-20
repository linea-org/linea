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
import { githubAuthorizationScopes } from './github-oauth-provider'

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
    if (input.provider === 'github') {
      const application = await repositories.application.getApplicationById(
        db,
        principal.workspaceId,
        principal.applicationId,
      )
      const providerPolicy = application?.connectorAccessPolicy.providers.find(
        (candidate) => candidate.provider === 'github',
      )
      let requiredScopes: string[]
      try {
        requiredScopes = githubAuthorizationScopes(
          providerPolicy?.actionFamilies ?? [],
        )
      } catch {
        throw new ForbiddenException(
          publicError('scope_denied', 'Connection authorization denied'),
        )
      }
      if (
        requiredScopes.some(
          (scope) => !providerPolicy?.maxScopes.includes(scope),
        ) ||
        requiredScopes.length !== input.scopes.length ||
        requiredScopes.some((scope, index) => scope !== input.scopes[index])
      ) {
        throw new ForbiddenException(
          publicError('scope_denied', 'Connection authorization denied'),
        )
      }
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
        scopes: input.scopes,
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
        scopes: input.scopes,
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
      const application = await repositories.application.getApplicationById(
        db,
        request.workspaceId,
        request.applicationId,
      )
      const providerPolicy = application?.connectorAccessPolicy.providers.find(
        (candidate) => candidate.provider === providerName,
      )
      if (!providerPolicy) return authorizationResultUrl(request, 'failed')
      const requiredScopes =
        providerName === 'github'
          ? githubAuthorizationScopes(providerPolicy.actionFamilies)
          : request.scopes
      if (
        requiredScopes.length !== request.scopes.length ||
        requiredScopes.some((scope, index) => scope !== request.scopes[index])
      ) {
        return authorizationResultUrl(request, 'failed')
      }
      const credential = await provider.exchangeAuthorizationCode({
        code: input.code,
        redirectUri: callbackUrl(providerName),
        codeVerifier: decryptCredential(request.codeVerifierEncrypted, context),
        scopes: request.scopes,
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
            grantedScopes: credential.grantedScopes,
            actionFamilies: providerPolicy.actionFamilies,
            requiredScopes,
            credentialPlaintext: JSON.stringify(credential),
            now: new Date(),
          },
        )
      if (completed.outcome !== 'completed') {
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
      current.scopes,
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

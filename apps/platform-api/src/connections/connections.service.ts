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
import {
  connectionAuthorizationStatusSchema,
  connectionStatusSchema,
  connectionUseSchema,
} from '@linea/protocol/resources'
import type {
  Connection as PublicConnection,
  ConnectionAuthorization,
  ConnectionAuthorizationResponse,
  ConnectionsResponse,
  ConnectionUse,
  ConnectionOAuthCallback,
  ListConnectionUsesQuery,
  ListConnectionsQuery,
  StartConnectionAuthorization,
  StartConnectionScopeUpgrade,
} from '@linea/protocol/resources'
import { publicError } from '../auth/public-error'
import type { EndUserPrincipal } from '../end-user-sessions/end-user-session.guard'
import {
  decodeConnectionCursor,
  decodeConnectionUseCursor,
  encodeConnectionCursor,
  encodeConnectionUseCursor,
} from '../public-runtime/public-pagination'
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
      await this.assertGithubScopes(principal, input.scopes)
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

  async startScopeUpgrade(
    principal: EndUserPrincipal,
    connectionId: string,
    input: StartConnectionScopeUpgrade,
  ): Promise<ConnectionAuthorizationResponse> {
    const connection = await repositories.connection.getConnection(
      db,
      principal,
      connectionId,
    )
    if (!connection || connection.status === 'revoked') {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    const provider = this.providers.find(
      (candidate) => candidate.provider === connection.provider,
    )
    if (!provider) {
      throw new ServiceUnavailableException(
        publicError('service_unavailable', 'Connection provider unavailable'),
      )
    }
    if (connection.provider === 'github') {
      await this.assertGithubScopes(principal, input.scopes)
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
        provider: connection.provider,
        scopes: input.scopes,
        returnUri: input.returnUri,
        stateHash: hash(state),
        codeVerifierEncrypted: encryptCredential(codeVerifier, {
          workspaceId: principal.workspaceId,
          applicationId: principal.applicationId,
          externalSubjectId: principal.externalSubjectId,
          recordId: id,
          provider: connection.provider,
        }),
        expiresAt: new Date(Date.now() + AUTHORIZATION_LIFETIME_MS),
        targetConnectionId: connection.id,
      })
    if (result.outcome === 'connection_unavailable') {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    if (result.outcome === 'connection_scope_insufficient') {
      throw new ForbiddenException(
        publicError(
          'connection_scope_insufficient',
          'Scope upgrade must preserve current scopes and add new authority',
        ),
      )
    }
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
        redirectUri: callbackUrl(connection.provider),
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
      if ('error' in input) {
        await this.failAuthorization(request, claimedAt)
        return authorizationResultUrl(request, 'failed')
      }
      if (!request.codeVerifierEncrypted) {
        await this.failAuthorization(request, claimedAt)
        return authorizationResultUrl(request, 'failed')
      }
      const application = await repositories.application.getApplicationById(
        db,
        request.workspaceId,
        request.applicationId,
      )
      const providerPolicy = application?.connectorAccessPolicy.providers.find(
        (candidate) => candidate.provider === providerName,
      )
      if (!providerPolicy) {
        await this.failAuthorization(request, claimedAt)
        return authorizationResultUrl(request, 'failed')
      }
      let requiredScopes: string[]
      if (providerName === 'github') {
        try {
          requiredScopes = githubAuthorizationScopes(
            providerPolicy.actionFamilies,
          )
        } catch {
          await this.failAuthorization(request, claimedAt)
          return authorizationResultUrl(request, 'failed')
        }
      } else {
        requiredScopes = request.scopes
      }
      if (
        requiredScopes.length !== request.scopes.length ||
        requiredScopes.some((scope, index) => scope !== request.scopes[index])
      ) {
        await this.failAuthorization(request, claimedAt)
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
        await this.failAuthorization(request, claimedAt)
        return authorizationResultUrl(request, 'failed')
      }
      return authorizationResultUrl(request, 'connected')
    } catch {
      await this.failAuthorization(request, claimedAt)
      return authorizationResultUrl(request, 'failed')
    }
  }

  async getAuthorization(
    principal: EndUserPrincipal,
    authorizationId: string,
  ): Promise<ConnectionAuthorization> {
    const request =
      await repositories.connection.getConnectionAuthorizationRequest(
        db,
        principal,
        authorizationId,
      )
    if (!request) {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection authorization not found'),
      )
    }
    let authorizationStatus = request.outcome
    if (!authorizationStatus) {
      authorizationStatus =
        request.expiresAt <= new Date() ? 'expired' : 'pending'
    }
    const status =
      connectionAuthorizationStatusSchema.parse(authorizationStatus)
    return {
      id: request.id,
      provider: request.provider,
      scopes: request.scopes,
      status,
      connectionId: request.resultConnectionId,
      createdAt: request.createdAt.toISOString(),
      expiresAt: request.expiresAt.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
    }
  }

  async list(
    principal: EndUserPrincipal,
    query: ListConnectionsQuery,
  ): Promise<ConnectionsResponse> {
    if (query.limit === undefined && query.cursor === undefined) {
      const connections = await repositories.connection.listConnections(
        db,
        principal,
      )
      return { data: connections.map(publicConnection) }
    }
    const limit = query.limit ?? 20
    const connections = await repositories.connection.findConnections(db, {
      ...principal,
      limit: limit + 1,
      cursor: decodeConnectionCursor(query.cursor),
    })
    const page = connections.slice(0, limit)
    const last = page.at(-1)
    return {
      data: page.map(publicConnection),
      nextCursor:
        connections.length > limit && last
          ? encodeConnectionCursor(last)
          : null,
    }
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
    if (!current || current.status === 'revoked') {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    const now = new Date()
    const deliveryId = current.credentialEncrypted ? randomUUID() : undefined
    const revocationCredentialEncrypted = current.credentialEncrypted
      ? encryptCredential(
          JSON.stringify(
            parseConnectionProviderCredential(
              decryptCredential(current.credentialEncrypted, {
                workspaceId: current.workspaceId,
                applicationId: current.applicationId,
                externalSubjectId: current.externalSubjectId,
                recordId: current.id,
                provider: current.provider,
              }),
              current.scopes,
            ),
          ),
          {
            workspaceId: current.workspaceId,
            applicationId: current.applicationId,
            externalSubjectId: current.externalSubjectId,
            recordId: deliveryId ?? current.id,
            provider: `${current.provider}:revocation`,
          },
        )
      : undefined
    const revoked = await repositories.connection.revokeConnection(
      db,
      principal,
      connectionId,
      {
        expectedCredentialVersion: current.credentialVersion,
        deliveryId,
        revocationCredentialEncrypted,
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

  async listUses(
    principal: EndUserPrincipal,
    connectionId: string,
    query: ListConnectionUsesQuery,
  ): Promise<{ data: ConnectionUse[]; nextCursor: string | null }> {
    if (
      !(await repositories.connection.getConnection(
        db,
        principal,
        connectionId,
      ))
    ) {
      throw new NotFoundException(
        publicError('resource_not_found', 'Connection not found'),
      )
    }
    const cursor = decodeConnectionUseCursor(query.cursor)
    const input = {
      ...principal,
      connectionId,
      limit: query.limit + 1,
      cursor,
    }
    const [reads, intents] = await Promise.all([
      repositories.connection.findConnectionReadUses(db, input),
      repositories.actionIntent.findTerminalActionIntents(db, input),
    ])
    const uses = [
      ...reads.map((use) =>
        connectionUseSchema.parse({
          id: use.id,
          connectionId: use.connectionId,
          executionId: use.executionId,
          actionIntentId: null,
          operation: use.operationId,
          classification: 'read',
          outcome: use.outcome,
          occurredAt: use.occurredAt.toISOString(),
        }),
      ),
      ...intents.map((intent) =>
        connectionUseSchema.parse({
          id: intent.id,
          connectionId: intent.connectionId,
          executionId: intent.executionId,
          actionIntentId: intent.id,
          operation: intent.operationId,
          classification: 'side_effect',
          outcome: intent.status,
          occurredAt: intent.updatedAt.toISOString(),
        }),
      ),
    ].sort((left, right) =>
      right.occurredAt === left.occurredAt
        ? right.id.localeCompare(left.id)
        : right.occurredAt.localeCompare(left.occurredAt),
    )
    const page = uses.slice(0, query.limit)
    const last = page.at(-1)
    return {
      data: page,
      nextCursor:
        uses.length > query.limit && last
          ? encodeConnectionUseCursor({
              occurredAt: new Date(last.occurredAt),
              id: last.id,
            })
          : null,
    }
  }

  private async failAuthorization(
    request: StoredConnectionAuthorizationRequest,
    claimedAt: Date,
  ): Promise<void> {
    await repositories.connection.failConnectionAuthorizationRequest(db, {
      authorizationRequestId: request.id,
      claimedAt,
      completedAt: new Date(),
    })
  }

  private async assertGithubScopes(
    principal: EndUserPrincipal,
    scopes: string[],
  ): Promise<void> {
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
      requiredScopes.length !== scopes.length ||
      requiredScopes.some((scope, index) => scope !== scopes[index])
    ) {
      throw new ForbiddenException(
        publicError('scope_denied', 'Connection authorization denied'),
      )
    }
  }
}

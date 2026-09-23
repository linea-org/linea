import { Inject, Injectable } from '@nestjs/common'
import {
  db,
  decryptCredential,
  encryptCredential,
  repositories,
  type Connection,
} from '@linea/db'
import type { EndUserPrincipal } from '../end-user-sessions/end-user-session.guard'
import {
  CONNECTION_OAUTH_PROVIDERS,
  ConnectionProviderInvalidGrantError,
  type ConnectionOAuthProvider,
  type ConnectionProviderCredential,
} from './connection-oauth-provider'
import { parseConnectionProviderCredential } from './connection-provider-credential'

function encryptionContext(connection: Connection) {
  return {
    workspaceId: connection.workspaceId,
    applicationId: connection.applicationId,
    externalSubjectId: connection.externalSubjectId,
    recordId: connection.id,
    provider: connection.provider,
  }
}

function credential(connection: Connection): ConnectionProviderCredential {
  if (!connection.credentialEncrypted) {
    throw new ConnectionProviderInvalidGrantError('Reauthorization required')
  }
  return parseConnectionProviderCredential(
    decryptCredential(
      connection.credentialEncrypted,
      encryptionContext(connection),
    ),
    connection.scopes,
  )
}

@Injectable()
export class ConnectionCredentialsService {
  constructor(
    @Inject(CONNECTION_OAUTH_PROVIDERS)
    private readonly providers: readonly ConnectionOAuthProvider[],
  ) {}

  async resolve(
    owner: EndUserPrincipal,
    connectionId: string,
    now = new Date(),
  ): Promise<ConnectionProviderCredential> {
    const connection = await repositories.connection.getConnection(
      db,
      owner,
      connectionId,
    )
    if (connection?.status !== 'active') {
      throw new ConnectionProviderInvalidGrantError('Reauthorization required')
    }
    const current = credential(connection)
    if (
      !current.expiresAt ||
      Date.parse(current.expiresAt) > now.getTime() + 60_000
    ) {
      return current
    }
    const provider = this.providers.find(
      (candidate) => candidate.provider === connection.provider,
    )
    if (!provider) throw new Error('Connection provider unavailable')
    try {
      const refreshed = await provider.refreshCredential(current)
      if (
        connection.scopes.some(
          (scope) => !refreshed.grantedScopes.includes(scope),
        )
      ) {
        throw new ConnectionProviderInvalidGrantError(
          'Reauthorization required',
        )
      }
      const rotated = await repositories.connection.rotateConnectionCredential(
        db,
        owner,
        connection.id,
        connection.credentialVersion,
        encryptCredential(
          JSON.stringify(refreshed),
          encryptionContext(connection),
        ),
        now,
      )
      if (rotated) return refreshed
      const latest = await repositories.connection.getConnection(
        db,
        owner,
        connection.id,
      )
      if (latest?.status !== 'active') {
        throw new ConnectionProviderInvalidGrantError(
          'Reauthorization required',
        )
      }
      return credential(latest)
    } catch (error) {
      if (!(error instanceof ConnectionProviderInvalidGrantError)) throw error
      await repositories.connection.requireConnectionReauthorization(
        db,
        owner,
        connection.id,
        connection.credentialVersion,
        now,
      )
      throw error
    }
  }
}

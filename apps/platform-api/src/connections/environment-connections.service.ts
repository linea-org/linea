import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import {
  authorizeGithubInstallation,
  githubInstallationScopes,
  type GithubInstallationCredential,
} from '@linea/connectors'
import { db, encryptCredential, repositories } from '@linea/db'
import type { CreateGithubInstallationConnection } from '@linea/protocol/resources'
import { publicConnection } from './connection-projection'

type Owner = { workspaceId: string; environmentId: string }
type AuthorizationKind = 'requester' | 'reviewer'

@Injectable()
export class EnvironmentConnectionsService {
  private async requireEnvironment(owner: Owner): Promise<void> {
    const environment = await repositories.environment.getEnvironmentById(
      db,
      owner.workspaceId,
      owner.environmentId,
    )
    if (!environment) throw new NotFoundException('Environment not found')
  }
  private async requireConnection(
    owner: Owner,
    connectionId: string,
  ): Promise<void> {
    await this.requireEnvironment(owner)
    const connection =
      await repositories.sharedConnection.getSharedEnvironmentConnection(
        db,
        owner,
        connectionId,
      )
    if (!connection) throw new NotFoundException('Shared Connection not found')
  }
  private async administer<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (
        error instanceof
        repositories.sharedConnection.SharedConnectionAuthorizationError
      )
        throw new BadRequestException(error.message)
      throw error
    }
  }
  async list(owner: Owner) {
    await this.requireEnvironment(owner)
    return (
      await repositories.sharedConnection.listEnvironmentConnections(db, owner)
    ).map(publicConnection)
  }
  async createGithubInstallation(
    owner: Owner,
    actorUserId: string,
    input: CreateGithubInstallationConnection,
  ) {
    await this.requireEnvironment(owner)
    let credential: GithubInstallationCredential
    try {
      credential = await authorizeGithubInstallation(input)
    } catch {
      throw new BadRequestException(
        'GitHub App installation could not be authorized with the supplied App credentials and permissions',
      )
    }
    const id = randomUUID()
    const credentialEncrypted = encryptCredential(JSON.stringify(credential), {
      ...owner,
      externalSubjectId: null,
      recordId: id,
      provider: 'github',
    })
    const connection = await this.administer(() =>
      repositories.sharedConnection.createSharedEnvironmentConnection(db, {
        ...owner,
        id,
        actorUserId,
        providerAccountId: credential.accountId,
        accountLabel: credential.accountLabel,
        scopes: githubInstallationScopes(credential.permissions),
        credentialEncrypted,
      }),
    )
    return publicConnection(connection)
  }
  async authorities(owner: Owner, connectionId: string) {
    await this.requireConnection(owner, connectionId)
    const authorities =
      await repositories.sharedConnection.listConnectionAuthorities(
        db,
        owner,
        connectionId,
      )
    const projection = (record: {
      id: string
      externalSubjectId: string
      createdAt: Date
      revokedAt: Date | null
    }) => ({
      id: record.id,
      externalSubjectId: record.externalSubjectId,
      createdAt: record.createdAt.toISOString(),
      revokedAt: record.revokedAt?.toISOString() ?? null,
    })
    return {
      grants: authorities.grants.map(projection),
      reviewers: authorities.reviewers.map(projection),
    }
  }
  async assign(
    owner: Owner,
    connectionId: string,
    externalSubjectId: string,
    actorUserId: string,
    kind: AuthorizationKind,
  ) {
    await this.requireConnection(owner, connectionId)
    const record = await this.administer(() =>
      repositories.sharedConnection.setConnectionSubjectAuthorization(db, {
        ...owner,
        connectionId,
        externalSubjectId,
        actorUserId,
        kind,
      }),
    )
    return {
      id: record.id,
      externalSubjectId: record.externalSubjectId,
      createdAt: record.createdAt.toISOString(),
      revokedAt: record.revokedAt?.toISOString() ?? null,
    }
  }
  async revokeAssignment(
    owner: Owner,
    connectionId: string,
    authorizationId: string,
    actorUserId: string,
    kind: AuthorizationKind,
  ) {
    await this.requireConnection(owner, connectionId)
    const record = await this.administer(() =>
      repositories.sharedConnection.revokeConnectionSubjectAuthorization(db, {
        ...owner,
        connectionId,
        authorizationId,
        actorUserId,
        kind,
      }),
    )
    return {
      id: record.id,
      externalSubjectId: record.externalSubjectId,
      createdAt: record.createdAt.toISOString(),
      revokedAt: record.revokedAt?.toISOString() ?? null,
    }
  }
  async revoke(owner: Owner, connectionId: string, actorUserId: string) {
    await this.requireConnection(owner, connectionId)
    return publicConnection(
      await this.administer(() =>
        repositories.sharedConnection.revokeSharedEnvironmentConnection(db, {
          ...owner,
          connectionId,
          actorUserId,
        }),
      ),
    )
  }
}

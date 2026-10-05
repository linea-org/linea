import type { Connection } from '@linea/db'
import {
  connectionStatusSchema,
  type Connection as PublicConnection,
} from '@linea/protocol/resources'

export function publicConnection(connection: Connection): PublicConnection {
  return {
    id: connection.id,
    ownership: connection.ownership,
    authorizationKind: connection.authorizationKind,
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

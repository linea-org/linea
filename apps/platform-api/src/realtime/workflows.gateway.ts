import { Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets'
import type { Socket } from 'socket.io'
import { getTrustedOrigins, isTrustedOrigin } from '../common/trusted-origin'
import {
  RealtimeTokenService,
  type RealtimeTokenPayload,
} from './realtime-token.service'

type Connection = {
  client: Socket
  payload: RealtimeTokenPayload
  checking?: Promise<boolean>
  expiresAt?: number
}

const REVALIDATION_MS = 30_000
const AUTHORIZATION_TIMEOUT_MS = 5_000

@WebSocketGateway({
  namespace: 'v1/workflows',
  path: '/v1/socket.io',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isTrustedOrigin(origin, getTrustedOrigins())) {
        callback(null, true)
        return
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false)
    },
    credentials: true,
  },
})
export class WorkflowsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(WorkflowsGateway.name)
  private readonly connections = new Map<string, Connection>()

  private timer?: ReturnType<typeof setTimeout>
  private destroyed = false

  constructor(private readonly tokens: RealtimeTokenService) {}

  async handleConnection(client: Socket) {
    const rawToken: unknown = client.handshake.auth?.token
    const payload =
      typeof rawToken === 'string' ? this.tokens.consume(rawToken) : undefined
    if (!payload) {
      client.disconnect(true)
      return
    }
    const connection: Connection = { client, payload }
    if (!(await this.authorize(connection)) || !client.connected) return
    if (this.destroyed) {
      client.disconnect(true)
      return
    }
    this.connections.set(client.id, connection)
    await this.broadcastPresence(payload.workflowId)
  }

  async handleDisconnect(client: Socket) {
    const connection = this.connections.get(client.id)
    if (!connection) return
    this.remove(connection)
    await this.broadcastPresence(connection.payload.workflowId)
  }

  onModuleInit() {
    this.scheduleRevalidation()
  }

  onModuleDestroy() {
    this.destroyed = true
    clearTimeout(this.timer)
    for (const connection of this.connections.values()) {
      this.remove(connection)
      connection.client.disconnect(true)
    }
  }

  async broadcastDraftUpdate(
    workflowId: string,
    payload: {
      graph: Record<string, unknown>
      updatedAt: string
      savedBy: { userId: string; name: string }
    },
  ) {
    const connections = await this.authorizedConnections(workflowId)
    for (const connection of connections) {
      if (this.isCurrent(connection))
        connection.client.emit('draft:updated', payload)
    }
  }

  private remove(connection: Connection) {
    this.connections.delete(connection.client.id)
  }

  private isCurrent(connection: Connection) {
    return (
      !!connection.expiresAt &&
      connection.expiresAt > Date.now() &&
      connection.client.connected &&
      this.connections.get(connection.client.id) === connection
    )
  }

  private scheduleRevalidation() {
    this.timer = setTimeout(() => {
      const workflows = new Set(
        Array.from(
          this.connections.values(),
          (connection) => connection.payload.workflowId,
        ),
      )
      void Promise.all(
        Array.from(workflows, (workflowId) =>
          this.broadcastPresence(workflowId),
        ),
      ).then(() => {
        if (!this.destroyed) this.scheduleRevalidation()
      })
    }, REVALIDATION_MS)
    this.timer.unref()
  }

  private authorize(connection: Connection): Promise<boolean> {
    if (connection.checking) return connection.checking
    connection.checking = this.checkAccess(connection).finally(() => {
      connection.checking = undefined
    })
    return connection.checking
  }

  private async checkAccess(connection: Connection): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const expiresAt = await Promise.race([
        repositories.builderSocketAccess.getBuilderSocketSessionExpiry(
          db,
          connection.payload,
        ),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Builder socket authorization timed out')),
            AUTHORIZATION_TIMEOUT_MS,
          )
        }),
      ])
      if (expiresAt && expiresAt.getTime() > Date.now()) {
        connection.expiresAt = expiresAt.getTime()
        return true
      }
    } catch (error) {
      this.logger.error('Builder socket authorization failed', error)
    } finally {
      clearTimeout(timeout)
    }
    connection.client.disconnect(true)
    this.remove(connection)
    return false
  }

  private async authorizedConnections(workflowId: string) {
    const candidates = Array.from(this.connections.values()).filter(
      (connection) => connection.payload.workflowId === workflowId,
    )
    const authorized = await Promise.all(
      candidates.map((connection) => this.authorize(connection)),
    )
    return candidates.filter(
      (connection, index) => authorized[index] && this.isCurrent(connection),
    )
  }

  private async broadcastPresence(workflowId: string) {
    const connections = await this.authorizedConnections(workflowId)
    const viewers = Array.from(
      new Map(
        connections.map(({ payload }) => [
          payload.userId,
          { userId: payload.userId, name: payload.name, image: payload.image },
        ]),
      ).values(),
    )
    for (const connection of connections) {
      if (this.isCurrent(connection))
        connection.client.emit('presence', viewers)
    }
  }
}

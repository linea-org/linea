import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { getTrustedOrigins, isTrustedOrigin } from '../common/trusted-origin'
import {
  RealtimeTokenService,
  type RealtimeTokenPayload,
} from './realtime-token.service'

type PresenceEntry = { userId: string; name: string; image: string | null }

function roomFor(workflowId: string): string {
  return `workflow:${workflowId}`
}

@WebSocketGateway({
  namespace: 'workflows',
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
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() private readonly server!: Server

  // workflowId -> socketId -> presence. Process-local, same caveat as RealtimeTokenService.
  private readonly presence = new Map<string, Map<string, PresenceEntry>>()

  constructor(private readonly tokens: RealtimeTokenService) {}

  handleConnection(client: Socket) {
    const rawToken = client.handshake.auth?.token as string | undefined
    const payload = rawToken ? this.tokens.consume(rawToken) : undefined
    if (!payload) {
      client.disconnect(true)
      return
    }

    client.data = payload satisfies RealtimeTokenPayload
    void client.join(roomFor(payload.workflowId))

    const room = this.presenceFor(payload.workflowId)
    room.set(client.id, {
      userId: payload.userId,
      name: payload.name,
      image: payload.image,
    })
    this.broadcastPresence(payload.workflowId)
  }

  handleDisconnect(client: Socket) {
    const data = client.data as Partial<RealtimeTokenPayload> | undefined
    if (!data?.workflowId) return
    this.presence.get(data.workflowId)?.delete(client.id)
    this.broadcastPresence(data.workflowId)
  }

  /** Called by WorkflowsService after a draft save lands — fans the new graph out to everyone else currently viewing this workflow's builder. */
  broadcastDraftUpdate(
    workflowId: string,
    payload: {
      graph: Record<string, unknown>
      updatedAt: string
      savedBy: { userId: string; name: string }
    },
  ) {
    this.server.to(roomFor(workflowId)).emit('draft:updated', payload)
  }

  private presenceFor(workflowId: string): Map<string, PresenceEntry> {
    let room = this.presence.get(workflowId)
    if (!room) {
      room = new Map()
      this.presence.set(workflowId, room)
    }
    return room
  }

  private broadcastPresence(workflowId: string) {
    const room = this.presence.get(workflowId)
    // Deduped by userId — the same person open in two tabs shows up once.
    const viewers = room
      ? Array.from(
          new Map(
            Array.from(room.values(), (v) => [v.userId, v] as const),
          ).values(),
        )
      : []
    this.server.to(roomFor(workflowId)).emit('presence', viewers)
  }
}

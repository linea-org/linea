import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'

export type RealtimeTokenPayload = {
  sessionId: string
  userId: string
  name: string
  image: string | null
  workspaceId: string
  workflowId: string
}

const TOKEN_TTL_MS = 60_000

type StoredToken = RealtimeTokenPayload & { expiresAt: number }

// Process-local tokens require sticky routing in multi-instance deployments.
@Injectable()
export class RealtimeTokenService {
  private readonly tokens = new Map<string, StoredToken>()

  mint(payload: RealtimeTokenPayload): { token: string; expiresAt: number } {
    this.sweep()
    const token = randomUUID()
    const expiresAt = Date.now() + TOKEN_TTL_MS
    this.tokens.set(token, { ...payload, expiresAt })
    return { token, expiresAt }
  }

  /** Not single-use — socket.io reuses the same handshake credential across its own reconnect attempts, so a token stays valid for every attempt within its TTL. */
  consume(token: string): RealtimeTokenPayload | undefined {
    const stored = this.tokens.get(token)
    if (!stored) return undefined
    if (stored.expiresAt <= Date.now()) {
      this.tokens.delete(token)
      return undefined
    }
    const { sessionId, userId, name, image, workspaceId, workflowId } = stored
    return { sessionId, userId, name, image, workspaceId, workflowId }
  }

  private sweep() {
    const now = Date.now()
    for (const [token, stored] of this.tokens) {
      if (stored.expiresAt <= now) this.tokens.delete(token)
    }
  }
}

import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'

export type RealtimeTokenPayload = {
  userId: string
  name: string
  image: string | null
  workspaceId: string
  workflowId: string
}

const TOKEN_TTL_MS = 60_000

type StoredToken = RealtimeTokenPayload & { expiresAt: number }

/**
 * Short-lived handshake tokens for the WebSocket gateway. A browser mints one
 * through an authenticated REST call (which already resolves session/API-key
 * auth the normal way) and hands it to socket.io as the connection credential
 * — this sidesteps depending on the session cookie being readable cross-origin
 * at the WS handshake, which isn't guaranteed once web and API live on
 * different hostnames in production.
 *
 * Process-local by design: fine for a single platform-api instance. A
 * multi-instance deployment would need this shared (e.g. Redis) since a
 * token minted on one instance wouldn't be visible to the socket.io process
 * that receives the handshake on another.
 */
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
    if (stored.expiresAt < Date.now()) {
      this.tokens.delete(token)
      return undefined
    }
    const { userId, name, image, workspaceId, workflowId } = stored
    return { userId, name, image, workspaceId, workflowId }
  }

  private sweep() {
    const now = Date.now()
    for (const [token, stored] of this.tokens) {
      if (stored.expiresAt < now) this.tokens.delete(token)
    }
  }
}

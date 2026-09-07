import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { CONVERSATION_IDLE_THRESHOLD_MS } from '@linea/runtime'
import { z } from 'zod'

const tokenPayloadSchema = z.object({
  version: z.literal(1),
  tokenId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  conversationId: z.string().uuid(),
  externalSubjectId: z.string().min(1),
  expiresAt: z.number().int(),
})

export type ConversationSessionClaims = Pick<
  z.infer<typeof tokenPayloadSchema>,
  'workspaceId' | 'workflowId' | 'conversationId' | 'externalSubjectId'
>

type VerifiedConversationSession = ConversationSessionClaims & {
  expiresAt: number
}

@Injectable()
export class ConversationSessionTokenService {
  private readonly secret: string
  constructor() {
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
    this.secret = secret
  }
  mint(claims: ConversationSessionClaims): {
    token: string
    expiresAt: number
  } {
    const expiresAt = Date.now() + CONVERSATION_IDLE_THRESHOLD_MS
    const payload = Buffer.from(
      JSON.stringify({
        version: 1,
        tokenId: randomUUID(),
        ...claims,
        expiresAt,
      }),
    ).toString('base64url')
    const signature = this.sign(payload)
    return { token: `lcs_${payload}.${signature}`, expiresAt }
  }
  verify(token: string): VerifiedConversationSession | undefined {
    const match = /^lcs_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token)
    if (!match) return undefined
    const [, payload, suppliedSignature] = match
    const expectedSignature = this.sign(payload)
    const supplied = Buffer.from(suppliedSignature, 'base64url')
    const expected = Buffer.from(expectedSignature, 'base64url')
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return undefined
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    } catch {
      return undefined
    }
    const result = tokenPayloadSchema.safeParse(parsed)
    if (!result.success || result.data.expiresAt <= Date.now()) return undefined
    const {
      workspaceId,
      workflowId,
      conversationId,
      externalSubjectId,
      expiresAt,
    } = result.data
    return {
      workspaceId,
      workflowId,
      conversationId,
      externalSubjectId,
      expiresAt,
    }
  }
  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(`conversation-session-v1.${payload}`)
      .digest('base64url')
  }
}

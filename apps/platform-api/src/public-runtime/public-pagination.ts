import { BadRequestException } from '@nestjs/common'
import { z, type ZodType } from 'zod'
import { publicError } from '../auth/public-error'

const conversationCursorSchema = z.strictObject({
  lastActivityAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
})
const messageCursorSchema = z.number().int().positive()
const approvalRequestCursorSchema = z.strictObject({
  requestedAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
})
const webhookDeliveryCursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
})

export type PublicConversationCursor = {
  lastActivityAt: Date
  id: string
}

export type PublicApprovalRequestCursor = {
  requestedAt: Date
  id: string
}

export type PublicWebhookDeliveryCursor = {
  createdAt: Date
  id: string
}

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeCursor<T>(cursor: string | undefined, schema: ZodType<T>) {
  if (!cursor) return undefined
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    invalidCursor()
  }
  const result = schema.safeParse(decoded)
  if (!result.success) invalidCursor()
  return result.data
}

function invalidCursor(): never {
  throw new BadRequestException(
    publicError('validation_failed', 'Pagination cursor is invalid'),
  )
}

export function encodeConversationCursor(
  cursor: PublicConversationCursor,
): string {
  return encodeCursor({
    lastActivityAt: cursor.lastActivityAt.toISOString(),
    id: cursor.id,
  })
}

export function decodeConversationCursor(
  cursor: string | undefined,
): PublicConversationCursor | undefined {
  const decoded = decodeCursor(cursor, conversationCursorSchema)
  return decoded
    ? { lastActivityAt: new Date(decoded.lastActivityAt), id: decoded.id }
    : undefined
}

export function encodeMessageCursor(sequence: number): string {
  return encodeCursor(sequence)
}

export function decodeMessageCursor(
  cursor: string | undefined,
): number | undefined {
  return decodeCursor(cursor, messageCursorSchema)
}

export function encodeApprovalRequestCursor(
  cursor: PublicApprovalRequestCursor,
): string {
  return encodeCursor({
    requestedAt: cursor.requestedAt.toISOString(),
    id: cursor.id,
  })
}

export function decodeApprovalRequestCursor(
  cursor: string | undefined,
): PublicApprovalRequestCursor | undefined {
  const decoded = decodeCursor(cursor, approvalRequestCursorSchema)
  return decoded
    ? { requestedAt: new Date(decoded.requestedAt), id: decoded.id }
    : undefined
}

export function encodeWebhookDeliveryCursor(
  cursor: PublicWebhookDeliveryCursor,
): string {
  return encodeCursor({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  })
}

export function decodeWebhookDeliveryCursor(
  cursor: string | undefined,
): PublicWebhookDeliveryCursor | undefined {
  const decoded = decodeCursor(cursor, webhookDeliveryCursorSchema)
  return decoded
    ? { createdAt: new Date(decoded.createdAt), id: decoded.id }
    : undefined
}

import { z } from 'zod'

const cursorSchema = z.object({
  updatedAt: z.string().regex(/^[\d\-: .+]+$/),
  id: z.uuid(),
})

export type ConversationCursor = z.infer<typeof cursorSchema>

export function encodeCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

/** Reads a cursor from a request; anything this service did not issue is rejected. */
export const cursorParam = z.string().transform((value, ctx) => {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    )
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid cursor' })
    return z.NEVER
  }
})

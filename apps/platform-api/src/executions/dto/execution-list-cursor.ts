import { z } from 'zod'

type ExecutionListCursor = { value: string; id: string }

/** `${sortKey}_${id}`: a uuid has no underscore, so the last one splits them whatever the sort key holds. */
export function encodeExecutionListCursor(cursor: ExecutionListCursor) {
  return `${cursor.value}_${cursor.id}`
}

export const executionListCursorSchema = z
  .string()
  .transform((cursor, ctx): ExecutionListCursor => {
    const separatorIndex = cursor.lastIndexOf('_')
    const id = z.uuid().safeParse(cursor.slice(separatorIndex + 1))
    if (separatorIndex === -1 || !id.success) {
      ctx.addIssue({ code: 'custom', message: 'Invalid cursor' })
      return z.NEVER
    }
    return { value: cursor.slice(0, separatorIndex), id: id.data }
  })

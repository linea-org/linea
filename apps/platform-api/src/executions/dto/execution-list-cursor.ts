import { z } from 'zod'

type ExecutionListCursor = { value: string; id: string; asOf?: Date }

/** `${sortKey}_${id}_${asOfMs}`: only the sort key can hold an underscore; split from the end. */
export function encodeExecutionListCursor(cursor: ExecutionListCursor) {
  const position = `${cursor.value}_${cursor.id}`
  return cursor.asOf ? `${position}_${cursor.asOf.getTime()}` : position
}

export const executionListCursorSchema = z
  .string()
  .transform((cursor, ctx): ExecutionListCursor => {
    const asOfMs = /_(\d{1,15})$/.exec(cursor)?.[1]
    const position = asOfMs ? cursor.slice(0, -asOfMs.length - 1) : cursor
    const separatorIndex = position.lastIndexOf('_')
    const id = z.uuid().safeParse(position.slice(separatorIndex + 1))
    if (separatorIndex === -1 || !id.success) {
      ctx.addIssue({ code: 'custom', message: 'Invalid cursor' })
      return z.NEVER
    }
    return {
      value: position.slice(0, separatorIndex),
      id: id.data,
      ...(asOfMs ? { asOf: new Date(Number(asOfMs)) } : {}),
    }
  })

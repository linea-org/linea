import { z } from 'zod'
import { executionListCursorSchema } from './execution-list-cursor'

const sortSchema = z.object({
  column: z.enum(['workflow', 'status', 'trigger', 'duration', 'cost', 'when']),
  direction: z.enum(['asc', 'desc']),
})

type SortColumn = z.infer<typeof sortSchema>['column']

const executionSortSchema = z.string().transform((sort, ctx) => {
  const [column, direction, ...extra] = sort.split('.')
  const parsed = sortSchema.safeParse({ column, direction })
  if (!parsed.success || extra.length > 0) {
    ctx.addIssue({ code: 'custom', message: 'Invalid sort' })
    return z.NEVER
  }
  return parsed.data
})

const textKey = z.string()
const bigintKey = z
  .string()
  .refine(
    (value) =>
      /^-?\d{1,19}$/.test(value) &&
      BigInt.asIntN(64, BigInt(value)) === BigInt(value),
  )

// The database casts a cursor's sort key to the sorted column's type; reject what would not cast.
const cursorValueSchemas: Record<SortColumn, z.ZodType<string>> = {
  workflow: textKey,
  status: textKey,
  trigger: textKey,
  duration: bigintKey,
  cost: bigintKey,
  when: z.iso.datetime(),
}

export const listWorkspaceExecutionsSchema = z
  .object({
    status: z
      .enum(['queued', 'running', 'paused', 'succeeded', 'failed', 'cancelled'])
      .optional(),
    trigger: z.enum(['manual', 'schedule', 'webhook', 'api']).optional(),
    /** `<column>.<asc|desc>`; newest first when omitted. */
    sort: executionSortSchema.optional(),
    /** The previous page's `nextCursor`, valid only with the sort that issued it. */
    cursor: executionListCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .superRefine((query, ctx) => {
    const column = query.sort?.column ?? 'when'
    if (
      query.cursor &&
      !cursorValueSchemas[column].safeParse(query.cursor.value).success
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'Cursor does not match the sort',
      })
    }
  })

export type ListWorkspaceExecutionsDto = z.infer<
  typeof listWorkspaceExecutionsSchema
>

import { z } from "zod"
import { cursorSchema, type Cursor } from "./cursor"

export const paginationLimitSchema = z.coerce.number().int().min(1).max(100)

export const paginationQuerySchema = z.strictObject({
  cursor: z.preprocess(
    (value) => (value === "" ? undefined : value),
    cursorSchema.optional()
  ),
  limit: paginationLimitSchema.default(20),
})

export function paginatedResponseSchema<TItemSchema extends z.ZodType>(
  itemSchema: TItemSchema
) {
  return z.strictObject({
    data: z.array(itemSchema),
    nextCursor: cursorSchema.nullable(),
  })
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>
export type PaginatedResponse<TItem> = {
  data: TItem[]
  nextCursor: Cursor | null
}

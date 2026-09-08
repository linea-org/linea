import { z } from "zod"

export const idempotencyHeaderName = "idempotency-key"
export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[!-~]+$/)
export const idempotencyHeadersSchema = z.strictObject({
  [idempotencyHeaderName]: idempotencyKeySchema,
})

export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>
export type IdempotencyHeaders = z.infer<typeof idempotencyHeadersSchema>

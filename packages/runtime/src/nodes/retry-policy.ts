import { z } from "zod"

export const MAX_RETRY_DELAY_MS = 60_000

export const MAX_NODE_ATTEMPT_MS = 60_000

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5),
  backoff: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("fixed"),
      delayMs: z.number().int().min(0).max(MAX_RETRY_DELAY_MS),
    }),
    z.object({
      type: z.literal("exponential"),
      delayMs: z.number().int().min(0).max(MAX_RETRY_DELAY_MS),
    }),
  ]),
  timeoutMs: z.number().int().min(1000).max(MAX_NODE_ATTEMPT_MS).optional(),
})

export type RetryPolicy = z.infer<typeof retryPolicySchema>

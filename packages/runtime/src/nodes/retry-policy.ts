import { z } from "zod"

/** Omitted on a node means no retry — existing graphs keep today's behavior. */
export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(5),
  backoff: z.discriminatedUnion("type", [
    z.object({ type: z.literal("fixed"), delayMs: z.number().int().min(0) }),
    z.object({
      type: z.literal("exponential"),
      delayMs: z.number().int().min(0),
    }),
  ]),
  timeoutMs: z.number().int().min(1000).optional(),
})

export type RetryPolicy = z.infer<typeof retryPolicySchema>

import type { z } from "zod"

export type NodeDefinition<TInput = unknown, TOutput = unknown> = {
  id: string
  inputSchema: z.ZodType<TInput>
  outputSchema: z.ZodType<TOutput>
  needsSandbox: boolean
}

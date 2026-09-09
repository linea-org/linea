import { z } from "zod"
import { publicErrorCodeSchema } from "./error-code"

export const publicErrorSchema = z.strictObject({
  code: publicErrorCodeSchema,
  message: z.string().min(1),
})

export const publicErrorResponseSchema = z.strictObject({
  error: publicErrorSchema,
})

export type PublicError = z.infer<typeof publicErrorSchema>
export type PublicErrorResponse = z.infer<typeof publicErrorResponseSchema>

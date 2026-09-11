import { z } from "zod"
import type { PublicErrorCode } from "../errors/error-code"
import type { ApplicationKeyScope } from "../resources/application-key"

export const httpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
])
export const operationPlaneSchema = z.enum(["control", "end_user"])
export const operationAuthKindSchema = z.enum([
  "none",
  "workspace_session",
  "workspace_key",
  "application_key",
  "end_user_session",
])

export type HttpMethod = z.infer<typeof httpMethodSchema>
export type OperationPlane = z.infer<typeof operationPlaneSchema>
export type OperationAuthKind = z.infer<typeof operationAuthKindSchema>

export type OperationRequestSchemas = {
  readonly path: z.ZodType
  readonly query: z.ZodType
  readonly headers: z.ZodType
  readonly body: z.ZodType
}

export type OperationResponseSchema = {
  readonly status: number
  readonly body: z.ZodType
}

export type OperationDefinition = {
  readonly operationId: string
  readonly method: HttpMethod
  readonly path: "/v1" | `/v1/${string}`
  readonly plane: OperationPlane
  readonly auth:
    | {
        readonly kind: "application_key"
        readonly scopes: readonly ApplicationKeyScope[]
      }
    | {
        readonly kind: Exclude<OperationAuthKind, "application_key">
        readonly scopes: readonly string[]
      }
  readonly request: OperationRequestSchemas
  readonly response: OperationResponseSchema
  readonly errors: readonly PublicErrorCode[]
}

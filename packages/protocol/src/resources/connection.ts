import { z } from "zod"
import { identifierSchema } from "../shared/identifier"
import { timestampSchema } from "../shared/timestamp"

export const connectionProviderSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/)

export const connectionScopeSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:/-]+$/)

export const startConnectionAuthorizationSchema = z.strictObject({
  provider: connectionProviderSchema,
  returnUri: z.url().max(2000),
  scopes: z
    .array(connectionScopeSchema)
    .min(1)
    .max(50)
    .transform((scopes) =>
      [...new Set(scopes)].sort((left, right) => left.localeCompare(right))
    ),
})

export const connectionAuthorizationResponseSchema = z.strictObject({
  authorizationId: identifierSchema,
  authorizationUrl: z.url(),
})

const connectionOAuthCallbackStateSchema = z.string().min(1).max(2000)

export const connectionOAuthCallbackSchema = z.union([
  z.strictObject({
    code: z.string().min(1).max(2000),
    state: connectionOAuthCallbackStateSchema,
  }),
  z.strictObject({
    error: z.string().min(1).max(200),
    error_description: z.string().min(1).max(1000).optional(),
    state: connectionOAuthCallbackStateSchema,
  }),
])

export const connectionStatusSchema = z.enum([
  "active",
  "reauthorization_required",
  "revoked",
])

export const connectionSchema = z.strictObject({
  id: identifierSchema,
  provider: connectionProviderSchema,
  providerAccountId: z.string().min(1).max(500),
  accountLabel: z.string().min(1).max(500),
  status: connectionStatusSchema,
  scopes: z.array(connectionScopeSchema),
  credentialVersion: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
})

export const connectionsResponseSchema = z.strictObject({
  data: z.array(connectionSchema),
})

export type StartConnectionAuthorization = z.infer<
  typeof startConnectionAuthorizationSchema
>
export type ConnectionAuthorizationResponse = z.infer<
  typeof connectionAuthorizationResponseSchema
>
export type ConnectionOAuthCallback = z.infer<
  typeof connectionOAuthCallbackSchema
>
export type Connection = z.infer<typeof connectionSchema>

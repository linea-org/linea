import { z } from "zod"
import {
  paginationLimitSchema,
  paginationQuerySchema,
} from "../shared/pagination"
import { cursorSchema } from "../shared/cursor"
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
    )
    .optional(),
})

export const connectionAuthorizationResponseSchema = z.strictObject({
  authorizationId: identifierSchema,
  authorizationUrl: z.url(),
})

export const connectionAuthorizationStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
  "expired",
])

export const connectionAuthorizationSchema = z.strictObject({
  id: identifierSchema,
  provider: connectionProviderSchema,
  scopes: z.array(connectionScopeSchema).max(50),
  status: connectionAuthorizationStatusSchema,
  connectionId: identifierSchema.nullable(),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
})

export const startConnectionScopeUpgradeSchema = z.strictObject({
  returnUri: z.url().max(2000),
  scopes: z
    .array(connectionScopeSchema)
    .min(1)
    .max(50)
    .transform((scopes) =>
      [...new Set(scopes)].sort((left, right) => left.localeCompare(right))
    ),
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
  scopes: z.array(connectionScopeSchema).max(50),
  credentialVersion: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
})

export const listConnectionsQuerySchema = paginationQuerySchema.extend({
  limit: paginationLimitSchema.optional(),
})
export const connectionsResponseSchema = z.strictObject({
  data: z.array(connectionSchema),
  nextCursor: cursorSchema.nullable().optional(),
})

export const connectionUseClassificationSchema = z.enum(["read", "side_effect"])

export const connectionUseOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "stale",
  "rejected",
  "cancelled",
  "outcome_unknown",
])

export const connectionUseSchema = z.strictObject({
  id: identifierSchema,
  connectionId: identifierSchema,
  executionId: identifierSchema,
  actionIntentId: identifierSchema.nullable(),
  operation: z.string().min(1).max(200),
  classification: connectionUseClassificationSchema,
  outcome: connectionUseOutcomeSchema,
  occurredAt: timestampSchema,
})

export const listConnectionUsesQuerySchema = paginationQuerySchema

export type StartConnectionAuthorization = z.infer<
  typeof startConnectionAuthorizationSchema
>
export type ConnectionAuthorizationResponse = z.infer<
  typeof connectionAuthorizationResponseSchema
>
export type ConnectionAuthorization = z.infer<
  typeof connectionAuthorizationSchema
>
export type StartConnectionScopeUpgrade = z.infer<
  typeof startConnectionScopeUpgradeSchema
>
export type ConnectionOAuthCallback = z.infer<
  typeof connectionOAuthCallbackSchema
>
export type Connection = z.infer<typeof connectionSchema>
export type ConnectionsResponse = z.infer<typeof connectionsResponseSchema>
export type ListConnectionsQuery = z.infer<typeof listConnectionsQuerySchema>
export type ConnectionUse = z.infer<typeof connectionUseSchema>
export type ListConnectionUsesQuery = z.infer<
  typeof listConnectionUsesQuerySchema
>

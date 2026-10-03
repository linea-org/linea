import { z } from "zod"
import { connectionProviderSchema, connectionScopeSchema } from "./connection"
export const connectorAccessPolicySchema = z.strictObject({
  providers: z
    .array(
      z.strictObject({
        provider: connectionProviderSchema,
        actionFamilies: z
          .array(connectionProviderSchema)
          .min(1)
          .max(50)
          .transform((values) =>
            [...new Set(values)].sort((left, right) =>
              left.localeCompare(right)
            )
          ),
        maxScopes: z
          .array(connectionScopeSchema)
          .min(1)
          .max(50)
          .transform((values) =>
            [...new Set(values)].sort((left, right) =>
              left.localeCompare(right)
            )
          ),
      })
    )
    .max(20)
    .refine(
      (providers) =>
        new Set(providers.map(({ provider }) => provider)).size ===
        providers.length,
      "Provider entries must be unique"
    ),
})

export type ConnectorAccessPolicy = z.infer<typeof connectorAccessPolicySchema>

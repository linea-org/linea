import { z } from "zod"
import { connectionProviderSchema, connectionScopeSchema } from "./connection"
export const githubRepositoryTargetSchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/)
    .transform((value) => value.toLowerCase()),
  repository: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/)
    .transform((value) => value.toLowerCase()),
})

export function githubRepositoryAllowed(
  allowedRepositories:
    | readonly z.infer<typeof githubRepositoryTargetSchema>[]
    | undefined,
  target: unknown
): boolean {
  const parsed = githubRepositoryTargetSchema.safeParse(target)
  return (
    parsed.success &&
    (allowedRepositories ?? []).some(
      ({ owner, repository }) =>
        owner.toLowerCase() === parsed.data.owner &&
        repository.toLowerCase() === parsed.data.repository
    )
  )
}

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
        allowedRepositories: z
          .array(githubRepositoryTargetSchema)
          .max(100)
          .optional(),
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

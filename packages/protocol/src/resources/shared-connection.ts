import { z } from "zod"
import { connectionSchema } from "./connection"

export const githubInstallationPermissionsSchema = z
  .strictObject({
    metadata: z.literal("read"),
    issues: z.enum(["read", "write"]).optional(),
    pull_requests: z.enum(["read", "write"]).optional(),
  })
  .refine(
    (permissions) =>
      permissions.issues !== undefined ||
      permissions.pull_requests !== undefined,
    "Select issue or pull request permissions"
  )

export const createGithubInstallationConnectionSchema = z.strictObject({
  appClientId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_.-]+$/),
  installationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  privateKey: z.string().min(1).max(20000),
  permissions: githubInstallationPermissionsSchema,
})

export const connectionSubjectAuthorizationSchema = z.strictObject({
  externalSubjectId: z.uuid(),
})

export const connectionAuthorityRecordSchema = z.strictObject({
  id: z.uuid(),
  externalSubjectId: z.uuid(),
  createdAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
})

export const connectionAuthoritiesSchema = z.strictObject({
  grants: z.array(connectionAuthorityRecordSchema),
  reviewers: z.array(connectionAuthorityRecordSchema),
})

export const environmentConnectionsSchema = z.array(connectionSchema)

export type CreateGithubInstallationConnection = z.infer<
  typeof createGithubInstallationConnectionSchema
>
export type ConnectionAuthorities = z.infer<typeof connectionAuthoritiesSchema>
export type ConnectionAuthorityRecord = z.infer<
  typeof connectionAuthorityRecordSchema
>

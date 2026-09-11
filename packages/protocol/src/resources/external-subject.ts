import { z } from "zod"
import { identifierSchema } from "../shared/identifier"
import { timestampSchema } from "../shared/timestamp"

export const externalSubjectStatuses = [
  "provisioned",
  "verified",
  "disabled",
  "erased",
] as const

export const externalSubjectStatusSchema = z.enum(externalSubjectStatuses)

const externalSubjectMetadataValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
])

export const externalSubjectMetadataSchema = z
  .record(z.string().trim().min(1).max(64), externalSubjectMetadataValueSchema)
  .refine((metadata) => Object.keys(metadata).length <= 20, {
    message: "Metadata cannot contain more than 20 fields",
  })

export const provisionExternalSubjectSchema = z.strictObject({
  issuerSubject: z.string().trim().min(1).max(500),
  metadata: externalSubjectMetadataSchema.default({}),
})

export const externalSubjectSchema = z.strictObject({
  id: identifierSchema,
  issuerSubject: z.string().min(1),
  status: externalSubjectStatusSchema,
  metadata: externalSubjectMetadataSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export type ExternalSubjectStatus = z.infer<typeof externalSubjectStatusSchema>
export type ExternalSubjectMetadata = z.infer<
  typeof externalSubjectMetadataSchema
>
export type ProvisionExternalSubject = z.infer<
  typeof provisionExternalSubjectSchema
>
export type ExternalSubjectProjection = z.infer<typeof externalSubjectSchema>

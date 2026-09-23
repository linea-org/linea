import {
  applicationKeyScopes,
  applicationKeyScopeSchema,
} from '@linea/protocol/resources'
import { z } from 'zod'

export const createApplicationKeySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  scopes: z
    .array(applicationKeyScopeSchema)
    .min(1)
    .max(applicationKeyScopes.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'Scopes must be unique',
    }),
})

export type CreateApplicationKeyDto = z.infer<typeof createApplicationKeySchema>

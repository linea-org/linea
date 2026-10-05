import {
  environmentKeyScopes,
  environmentKeyScopeSchema,
} from '@linea/protocol/resources'
import { z } from 'zod'

export const createEnvironmentKeySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  scopes: z
    .array(environmentKeyScopeSchema)
    .min(1)
    .max(environmentKeyScopes.length)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'Scopes must be unique',
    }),
})

export type CreateEnvironmentKeyDto = z.infer<typeof createEnvironmentKeySchema>

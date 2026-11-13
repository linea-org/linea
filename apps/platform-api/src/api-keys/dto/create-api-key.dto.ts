import { z } from 'zod'
import { workspaceKeyScopeSchema } from '@linea/protocol/resources'

export const createApiKeySchema = z.strictObject({
  name: z.string().min(1).max(200),
  scopes: z
    .array(workspaceKeyScopeSchema)
    .min(1)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'Scopes must not repeat',
    }),
  expiresInDays: z.number().int().min(1).max(365),
})

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>

import { z } from 'zod'

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(200),
})

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>

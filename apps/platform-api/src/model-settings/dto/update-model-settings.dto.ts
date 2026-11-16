import { z } from 'zod'

export const updateModelSettingsSchema = z.object({
  defaultModel: z.string().min(1).max(100).nullable(),
})

export type UpdateModelSettingsDto = z.infer<typeof updateModelSettingsSchema>

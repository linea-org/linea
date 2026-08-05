import { z } from 'zod'

export const triggerWebhookSchema = z.record(z.string(), z.unknown()).optional()

export type TriggerWebhookDto = z.infer<typeof triggerWebhookSchema>

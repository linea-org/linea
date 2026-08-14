import { z } from 'zod'

export const listNotificationsSchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>

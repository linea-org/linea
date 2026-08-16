import { z } from 'zod'

export const listNotificationsSchema = z.object({
  // z.coerce.boolean() treats any non-empty string as true, so "?archived=false" would
  // otherwise be indistinguishable from "?archived=true" - only 'true'/'false' are accepted.
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export type ListNotificationsDto = z.infer<typeof listNotificationsSchema>

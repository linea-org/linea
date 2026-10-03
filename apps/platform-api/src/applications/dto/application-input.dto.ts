import { z } from 'zod'

export const createApplicationSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
})

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>

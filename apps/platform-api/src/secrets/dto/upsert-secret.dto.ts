import { z } from 'zod'

export const secretKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z][A-Za-z0-9_-]*$/,
    'Use letters, numbers, hyphens, and underscores',
  )

export const upsertSecretSchema = z.object({
  value: z.string().min(1).max(10_000),
})

export type UpsertSecretDto = z.infer<typeof upsertSecretSchema>

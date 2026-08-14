import { z } from 'zod'

export const secretKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    'must be upper snake case, e.g. ANTHROPIC_API_KEY',
  )

export const upsertSecretSchema = z.object({
  value: z.string().min(1).max(10_000),
})

export type UpsertSecretDto = z.infer<typeof upsertSecretSchema>

import { z } from 'zod'

const modelChoice = z.string().min(1).max(100).nullable().optional()

export const updateModelSettingsSchema = z
  .object({
    defaultModel: modelChoice,
    behaviourModel: modelChoice,
    judgeModel: modelChoice,
    stepModel: modelChoice,
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: 'At least one model setting is required',
    },
  )

export type UpdateModelSettingsDto = z.infer<typeof updateModelSettingsSchema>

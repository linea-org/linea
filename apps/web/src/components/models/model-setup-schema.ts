import { z } from "zod"

import type { ModelSetup } from "@/lib/model-settings-api"

export type ModelSetupValues = { model: string; apiKey: string }

export function modelHasKey(
  setup: ModelSetup,
  model: { keyName: string } | undefined
) {
  return setup.providers.some(
    (provider) => provider.keyName === model?.keyName && provider.configured
  )
}

export function buildModelSetupSchema(setup: ModelSetup) {
  const { models } = setup.settings
  return z
    .object({
      model: z.string().min(1, "Choose a model"),
      apiKey: z.string().trim(),
    })
    .superRefine((values, context) => {
      const model = models.find((item) => item.value === values.model)
      if (model && !modelHasKey(setup, model) && !values.apiKey) {
        context.addIssue({
          code: "custom",
          path: ["apiKey"],
          message: `Add your ${model.providerLabel} API key`,
        })
      }
    })
}

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { findOrCreateDevelopmentEnvironment } from "@/lib/default-application"
import {
  modelSetupKey,
  updateModelSettingsFn,
  type ModelSetup,
} from "@/lib/model-settings-api"
import { upsertSecretFn } from "@/lib/secrets-api"

import type { ModelSetupValues } from "./model-setup-schema"

export function useSaveModelSetup(
  slug: string,
  setup: ModelSetup,
  onSaved: (values: ModelSetupValues) => void
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: ModelSetupValues) => {
      const model = setup.settings.models.find(
        (item) => item.value === values.model
      )
      if (!model) throw new Error("Choose a model")
      if (values.apiKey) {
        const development = await findOrCreateDevelopmentEnvironment()
        await upsertSecretFn({
          data: {
            environmentId: development.id,
            key: model.keyName,
            value: values.apiKey,
          },
        })
      }
      await updateModelSettingsFn({ data: { defaultModel: values.model } })
    },
    onSuccess: async (_result, values) => {
      await queryClient.invalidateQueries({ queryKey: modelSetupKey(slug) })
      onSaved(values)
    },
  })
}

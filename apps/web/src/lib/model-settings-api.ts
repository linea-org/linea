import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { apiFetch, parseErrorMessage } from "./api-fetch"
import { listApplicationsFn } from "./applications-api"
import { listEnvironmentsFn } from "./environments-api"
import { listAiProvidersFn, type AiProviderKeyStatus } from "./secrets-api"

const modelSettingsSchema = z.object({
  defaultModel: z.string().nullable(),
  behaviourModel: z.string().nullable(),
  judgeModel: z.string().nullable(),
  stepModel: z.string().nullable(),
  analysisFallbackModel: z.string(),
  models: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      providerId: z.string(),
      providerLabel: z.string(),
      keyName: z.string(),
    })
  ),
})

export type ModelSettings = z.infer<typeof modelSettingsSchema>
export type TaskModelKey =
  | "defaultModel"
  | "behaviourModel"
  | "judgeModel"
  | "stepModel"
export type CatalogModel = ModelSettings["models"][number]

export const getModelSettingsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ModelSettings> => {
    const res = await apiFetch("/model-settings")
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not load model settings")
      )
    }
    return modelSettingsSchema.parse(await res.json())
  }
)

export const updateModelSettingsFn = createServerFn({ method: "POST" })
  .validator((data: Partial<Record<TaskModelKey, string | null>>) => data)
  .handler(async ({ data }): Promise<ModelSettings> => {
    const res = await apiFetch("/model-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not save the model"))
    }
    return modelSettingsSchema.parse(await res.json())
  })

/** Without a Development Environment nothing can hold a key yet, so every catalog provider is unconnected. */
function catalogProviders(settings: ModelSettings): AiProviderKeyStatus[] {
  const byKey = new Map(
    settings.models.map((model) => [
      model.keyName,
      {
        id: model.providerId,
        label: model.providerLabel,
        keyName: model.keyName,
        configured: false,
        platformFallback: false,
      },
    ])
  )
  return [...byKey.values()]
}

/** The chosen model, plus which providers already have a key in the default Application's Development Environment. */
export const getModelSetupFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const settings = await getModelSettingsFn()
    const [application] = await listApplicationsFn()
    const environments = application
      ? await listEnvironmentsFn({ data: { applicationId: application.id } })
      : []
    const development = environments.find((item) => item.environment === "dev")
    const providers: AiProviderKeyStatus[] = development
      ? await listAiProvidersFn({ data: { environmentId: development.id } })
      : catalogProviders(settings)
    return { settings, providers }
  }
)

export type ModelSetup = Awaited<ReturnType<typeof getModelSetupFn>>

export function modelSettingsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["model-settings", workspaceSlug],
    queryFn: () => getModelSettingsFn(),
  })
}

export function modelSetupQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["model-setup", workspaceSlug],
    queryFn: () => getModelSetupFn(),
  })
}

/** Ready means a model is chosen and its provider has a key: only then can anything run. */
export function isModelReady(setup: ModelSetup): boolean {
  const model = setup.settings.models.find(
    (item) => item.value === setup.settings.defaultModel
  )
  if (!model) return false
  return setup.providers.some(
    (provider) => provider.keyName === model.keyName && provider.configured
  )
}

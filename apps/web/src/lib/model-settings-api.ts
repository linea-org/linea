import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { apiFetch, parseErrorMessage } from "./api-fetch"

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
  providers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      keyName: z.string(),
      configured: z.boolean(),
      platformFallback: z.boolean(),
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

export const getModelSettingsFn = createServerFn({ method: "GET" })
  .validator((data: { applicationId?: string } | undefined) => data)
  .handler(async ({ data }): Promise<ModelSettings> => {
    const query = data?.applicationId
      ? `?applicationId=${data.applicationId}`
      : ""
    const res = await apiFetch(`/model-settings${query}`)
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not load model settings")
      )
    }
    return modelSettingsSchema.parse(await res.json())
  })

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

/** The chosen model, plus which providers already have a key where the assistant runs. */
export const getModelSetupFn = createServerFn({ method: "GET" })
  .validator((data: { applicationId?: string } | undefined) => data)
  .handler(async ({ data }) => {
    const { providers, ...settings } = await getModelSettingsFn({ data })
    return { settings, providers }
  })

export type ModelSetup = Awaited<ReturnType<typeof getModelSetupFn>>

export function modelSettingsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["model-settings", workspaceSlug],
    queryFn: () => getModelSettingsFn(),
  })
}

/** Without an application id the setup reads the workspace's default Application. */
export function modelSetupQueryOptions(
  workspaceSlug: string,
  applicationId?: string
) {
  return queryOptions({
    queryKey: ["model-setup", workspaceSlug, applicationId ?? null],
    queryFn: () => getModelSetupFn({ data: { applicationId } }),
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

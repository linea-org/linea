import { keepPreviousData, queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { jsonValueSchema } from "@linealabs/protocol/shared"
import { z } from "zod"

import { apiFetch, parseErrorMessage } from "./api-fetch"
import type { JsonValue } from "./executions-api"

const sharedTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(["workspace", "public"]),
  graph: z.record(z.string(), jsonValueSchema),
  starCount: z.number(),
  useCount: z.number(),
  starred: z.boolean(),
  mine: z.boolean(),
  canRemove: z.boolean(),
  canAppeal: z.boolean(),
  appeal: z
    .object({
      type: z.string(),
      status: z.enum(["open", "upheld", "rejected"]),
      decisionNote: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable(),
  moderation: z.object({
    status: z.enum(["active", "hidden"]),
    note: z.string().nullable(),
  }),
  workspaceName: z.string(),
  createdAt: z.string(),
})

export type SharedTemplate = z.infer<typeof sharedTemplateSchema>

const sharedTemplatePageSchema = z.object({
  items: z.array(sharedTemplateSchema),
  total: z.number(),
  pageSize: z.number(),
})

export type SharedTemplateScope = "workspace" | "public"
export type SharedTemplateSort = "stars" | "used" | "new"

export type SharedTemplateQuery = {
  scope: SharedTemplateScope
  q: string
  sort: SharedTemplateSort
  page: number
}

export const listSharedTemplatesFn = createServerFn({ method: "GET" })
  .validator((data: SharedTemplateQuery) => data)
  .handler(async ({ data }) => {
    const query = new URLSearchParams({
      scope: data.scope,
      q: data.q,
      sort: data.sort,
      page: String(data.page),
    })
    const res = await apiFetch(`/templates?${query}`)
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not load templates"))
    }
    return sharedTemplatePageSchema.parse(await res.json())
  })

export const publishTemplateFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      workflowId: string
      name: string
      description?: string
      visibility: "workspace" | "public"
    }) => data
  )
  .handler(async ({ data }): Promise<SharedTemplate> => {
    const res = await apiFetch("/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not publish"))
    }
    return sharedTemplateSchema.parse(await res.json())
  })

export const setTemplateStarFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; starred: boolean }) => data)
  .handler(async ({ data }) => {
    const res = await apiFetch(`/templates/${data.id}/star`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ starred: data.starred }),
    })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not star the template")
      )
    }
    return z
      .object({ starCount: z.number(), starred: z.boolean() })
      .parse(await res.json())
  })

export const useTemplateFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{ name: string; graph: Record<string, JsonValue> }> => {
      const res = await apiFetch(`/templates/${data.id}/use`, {
        method: "POST",
      })
      if (!res.ok) {
        throw new Error(
          await parseErrorMessage(res, "Could not use the template")
        )
      }
      return z
        .object({
          name: z.string(),
          graph: z.record(z.string(), jsonValueSchema),
        })
        .parse(await res.json())
    }
  )

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/templates/${data.id}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not remove the template")
      )
    }
  })

const appealTypesSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    hint: z.string(),
    messageRequired: z.boolean(),
  })
)

export type AppealType = z.infer<typeof appealTypesSchema>[number]

export const listAppealTypesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const res = await apiFetch("/templates/appeal-types")
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not load appeal options")
      )
    }
    return appealTypesSchema.parse(await res.json())
  }
)

export const appealTemplateFn = createServerFn({ method: "POST" })
  .validator((data: { id: string; type: string; message?: string }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/templates/${data.id}/appeal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: data.type, message: data.message }),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not send the appeal"))
    }
  })

export const appealTypesQueryOptions = queryOptions({
  queryKey: ["template-appeal-types"],
  queryFn: () => listAppealTypesFn(),
  staleTime: Infinity,
})

export const sharedTemplatesKey = (workspaceSlug: string) =>
  ["shared-templates", workspaceSlug] as const

export function sharedTemplatesQueryOptions(
  workspaceSlug: string,
  query: SharedTemplateQuery
) {
  return queryOptions({
    queryKey: [...sharedTemplatesKey(workspaceSlug), query],
    queryFn: () => listSharedTemplatesFn({ data: query }),
    placeholderData: keepPreviousData,
  })
}

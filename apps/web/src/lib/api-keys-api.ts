import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { workspaceKeyScopeSchema } from "@linea/protocol/resources"

import { apiFetch, parseErrorMessage } from "./api-fetch"

const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(workspaceKeyScopeSchema),
  keyPrefix: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
})

export type ApiKey = z.infer<typeof apiKeySchema>

export const createApiKeyInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(200),
  scopes: z.array(workspaceKeyScopeSchema).min(1, "Select at least one scope"),
  expiresInDays: z.number().int().min(1).max(365),
})

export const listApiKeysFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const res = await apiFetch("/api-keys")
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not load API keys"))
    }
    return z.array(apiKeySchema).parse(await res.json())
  }
)

export const createApiKeyFn = createServerFn({ method: "POST" })
  .validator(createApiKeyInputSchema)
  .handler(async ({ data }) => {
    const res = await apiFetch("/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not create API key"))
    }
    return apiKeySchema.extend({ rawKey: z.string() }).parse(await res.json())
  })

export const revokeApiKeyFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const res = await apiFetch(`/api-keys/${data.id}`, { method: "DELETE" })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not revoke API key"))
    }
    return apiKeySchema.parse(await res.json())
  })

export function apiKeysQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["api-keys", slug],
    queryFn: () => listApiKeysFn(),
  })
}

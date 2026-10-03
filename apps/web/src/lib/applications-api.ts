import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { apiFetch } from "./api-fetch"

export const applicationSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  slug: z.string(),
})

export type ApplicationSummary = z.infer<typeof applicationSchema>

export const listApplicationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const response = await apiFetch("/applications")
    if (!response.ok) throw new Error("Could not load Applications")
    return z.array(applicationSchema).parse(await response.json())
  }
)

export const createApplicationFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(100),
      slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    })
  )
  .handler(async ({ data }) => {
    const response = await apiFetch("/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!response.ok) throw new Error("Could not create Application")
    return applicationSchema.parse(await response.json())
  })

export function applicationsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["applications", workspaceSlug],
    queryFn: () => listApplicationsFn(),
  })
}

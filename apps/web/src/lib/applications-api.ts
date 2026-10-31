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

export const createApplicationInputSchema = z.object({
  name: z.string().trim().min(1, "Enter an Application name").max(100),
  slug: z
    .string()
    .min(1, "Enter an Application identifier")
    .max(100)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and hyphens"
    ),
})

export const listApplicationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const response = await apiFetch("/applications")
    if (!response.ok) throw new Error("Could not load Applications")
    return z.array(applicationSchema).parse(await response.json())
  }
)

export const createApplicationFn = createServerFn({ method: "POST" })
  .validator(createApplicationInputSchema)
  .handler(async ({ data }) => {
    const response = await apiFetch("/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const error = z.object({ message: z.string() }).safeParse(body)
      throw new Error(
        error.success ? error.data.message : "Could not create Application"
      )
    }
    return applicationSchema.parse(body)
  })

export function applicationsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["applications", workspaceSlug],
    queryFn: () => listApplicationsFn(),
  })
}

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { apiFetch } from "./api-fetch"

export const environmentSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  environment: z.enum(["dev", "production"]),
  displayName: z.string(),
  enabled: z.boolean(),
  contentRetentionDays: z.number(),
  allowedBrowserOrigins: z.array(z.string()),
  allowedRedirectOrigins: z.array(z.string()),
  oidcIssuer: z.string().nullable(),
  oidcClientId: z.string().nullable(),
  oidcAudience: z.string().nullable(),
  oidcJwksUrl: z.string().nullable(),
  oidcSubjectClaim: z.string(),
})

export type EnvironmentSummary = z.infer<typeof environmentSchema>

export const listEnvironmentsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ applicationId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(
      `/applications/${data.applicationId}/environments`
    )
    if (!response.ok) throw new Error("Could not load Environments")
    return z.array(environmentSchema).parse(await response.json())
  })

const trustSchema = z.object({
  environmentId: z.uuid(),
  allowedBrowserOrigins: z.array(z.string()).min(1),
  allowedRedirectOrigins: z.array(z.string()).min(1),
  oidcIssuer: z.url(),
  oidcClientId: z.string().min(1),
  oidcAudience: z.string().min(1),
  oidcJwksUrl: z.url(),
  oidcSubjectClaim: z.string().min(1),
})

export const replaceEnvironmentTrustFn = createServerFn({ method: "POST" })
  .inputValidator(trustSchema)
  .handler(async ({ data: { environmentId, ...trust } }) => {
    const response = await apiFetch(
      `/environments/${environmentId}/trust-configuration`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trust),
      }
    )
    if (!response.ok)
      throw new Error(
        "Could not save identity trust. Check the origins and Production HTTPS requirements."
      )
    return environmentSchema.parse(await response.json())
  })

export const updateEnvironmentRetentionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      environmentId: z.uuid(),
      contentRetentionDays: z.number().int().min(1).max(3650),
    })
  )
  .handler(async ({ data: { environmentId, contentRetentionDays } }) => {
    const response = await apiFetch(`/environments/${environmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentRetentionDays }),
    })
    if (!response.ok) throw new Error("Could not save content retention")
    return environmentSchema.parse(await response.json())
  })

export const disableEnvironmentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ environmentId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(
      `/environments/${data.environmentId}/disable`,
      { method: "POST" }
    )
    if (!response.ok) throw new Error("Could not disable Environment")
    return environmentSchema.parse(await response.json())
  })

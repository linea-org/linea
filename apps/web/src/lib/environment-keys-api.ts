import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { environmentKeyScopeSchema } from "@linea/protocol/resources"
import { apiFetch } from "./api-fetch"

const keySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(environmentKeyScopeSchema),
  revokedAt: z.string().nullable(),
})

export const listEnvironmentKeysFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ environmentId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(`/environments/${data.environmentId}/keys`)
    if (!response.ok) throw new Error("Could not load Environment keys")
    return z.array(keySchema).parse(await response.json())
  })

export const createEnvironmentKeyFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      environmentId: z.uuid(),
      name: z.string().trim().min(1).max(100),
      scopes: z.array(environmentKeyScopeSchema).min(1),
    })
  )
  .handler(async ({ data: { environmentId, ...input } }) => {
    const response = await apiFetch(`/environments/${environmentId}/keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error("Could not create Environment key")
    return keySchema.extend({ rawKey: z.string() }).parse(await response.json())
  })

export const revokeEnvironmentKeyFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ environmentId: z.uuid(), keyId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(
      `/environments/${data.environmentId}/keys/${data.keyId}`,
      { method: "DELETE" }
    )
    if (!response.ok) throw new Error("Could not revoke Environment key")
    return keySchema.parse(await response.json())
  })

export const rotateEnvironmentKeyFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ environmentId: z.uuid(), keyId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(
      `/environments/${data.environmentId}/keys/${data.keyId}/rotate`,
      { method: "POST" }
    )
    if (!response.ok) throw new Error("Could not rotate Environment key")
    return keySchema.extend({ rawKey: z.string() }).parse(await response.json())
  })

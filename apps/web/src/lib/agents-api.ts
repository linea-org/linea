import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { apiFetch } from "./api-fetch"
import { agentApiResponse } from "./agent-api-response"
import {
  agentSchema,
  agentCatalogSchema,
  agentVersionSchema,
  createAgentInputSchema,
  createAgentVersionInputSchema,
} from "./agent-schemas"

export const listAgentsFn = createServerFn({ method: "GET" })
  .validator(z.object({ applicationId: z.uuid() }))
  .handler(async ({ data }) =>
    agentApiResponse(
      await apiFetch(`/agents?applicationId=${data.applicationId}`),
      z.array(agentSchema)
    )
  )

export const getAgentFn = createServerFn({ method: "GET" })
  .validator(z.object({ agentId: z.uuid() }))
  .handler(async ({ data }) =>
    agentApiResponse(await apiFetch(`/agents/${data.agentId}`), agentSchema)
  )

export const getAgentCatalogFn = createServerFn({ method: "GET" }).handler(
  async () =>
    agentApiResponse(
      await apiFetch("/agents/authoring-catalog"),
      agentCatalogSchema
    )
)

export const createAgentFn = createServerFn({ method: "POST" })
  .validator(createAgentInputSchema)
  .handler(async ({ data }) =>
    agentApiResponse(
      await apiFetch("/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
      agentSchema
    )
  )

export const listAgentVersionsFn = createServerFn({ method: "GET" })
  .validator(z.object({ agentId: z.uuid() }))
  .handler(async ({ data }) =>
    agentApiResponse(
      await apiFetch(`/agents/${data.agentId}/versions`),
      z.array(agentVersionSchema)
    )
  )

export const createAgentVersionFn = createServerFn({ method: "POST" })
  .validator(createAgentVersionInputSchema)
  .handler(async ({ data: { agentId, ...input } }) =>
    agentApiResponse(
      await apiFetch(`/agents/${agentId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      agentVersionSchema
    )
  )

export const publishAgentVersionFn = createServerFn({ method: "POST" })
  .validator(z.object({ agentId: z.uuid(), versionId: z.uuid() }))
  .handler(async ({ data }) =>
    agentApiResponse(
      await apiFetch(
        `/agents/${data.agentId}/versions/${data.versionId}/publish`,
        { method: "POST" }
      ),
      agentVersionSchema
    )
  )

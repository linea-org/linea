import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { apiFetch } from "./api-fetch"
import { agentApiResponse } from "./agent-api-response"
import { agentBindingSchema } from "./agent-schemas"

export const listAgentDeploymentsFn = createServerFn({ method: "GET" })
  .validator(z.object({ environmentId: z.uuid() }))
  .handler(async ({ data }) =>
    agentApiResponse(
      await apiFetch(`/environments/${data.environmentId}/agent-bindings`),
      z.array(agentBindingSchema)
    )
  )

export const deployAgentFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      environmentId: z.uuid(),
      agentId: z.uuid(),
      agentVersionId: z.uuid(),
      agentContractRevisionId: z.uuid(),
      enabled: z.boolean(),
    })
  )
  .handler(async ({ data: { environmentId, agentId, ...input } }) =>
    agentApiResponse(
      await apiFetch(
        `/environments/${environmentId}/agent-bindings/${agentId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }
      ),
      agentBindingSchema
    )
  )

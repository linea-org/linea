import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { jsonSchemaDocumentSchema } from "@linea/protocol/resources"
import { apiFetch } from "./api-fetch"
import { agentApiResponse } from "./agent-api-response"
import { agentContractSchema } from "./agent-schemas"

export const listAgentContractsFn = createServerFn({ method: "GET" })
  .validator(z.object({ agentId: z.uuid() }))
  .handler(async ({ data }) =>
    agentApiResponse(
      await apiFetch(`/agents/${data.agentId}/contracts`),
      z.array(agentContractSchema)
    )
  )

export const createAgentContractFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      agentId: z.uuid(),
      inputSchema: jsonSchemaDocumentSchema,
      outputSchema: jsonSchemaDocumentSchema,
    })
  )
  .handler(async ({ data: { agentId, ...input } }) =>
    agentApiResponse(
      await apiFetch(`/agents/${agentId}/contracts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      agentContractSchema
    )
  )

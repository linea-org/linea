import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { environmentWorkflowBindingSchema } from "@linea/protocol/resources"
import { apiFetch } from "./api-fetch"

const versionSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  publishedAt: z.string().nullable(),
  workflowContractRevisionId: z.uuid().nullable(),
})

export const listDeploymentVersionsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ workflowId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(`/workflows/${data.workflowId}/versions`)
    if (!response.ok) throw new Error("Could not load Workflow versions")
    return z.array(versionSchema).parse(await response.json())
  })

export const listDeploymentsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ environmentId: z.uuid() }))
  .handler(async ({ data }) => {
    const response = await apiFetch(
      `/environments/${data.environmentId}/workflow-bindings`
    )
    if (!response.ok) throw new Error("Could not load deployments")
    return z
      .array(environmentWorkflowBindingSchema.strip())
      .parse(await response.json())
  })

export const deployWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      environmentId: z.uuid(),
      workflowId: z.uuid(),
      workflowVersionId: z.uuid(),
      workflowContractRevisionId: z.uuid(),
      allowBackendStart: z.boolean(),
      allowEndUserStart: z.boolean(),
      enabled: z.boolean(),
    })
  )
  .handler(async ({ data: { environmentId, workflowId, ...input } }) => {
    const response = await apiFetch(
      `/environments/${environmentId}/workflow-bindings/${workflowId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }
    )
    if (!response.ok)
      throw new Error("Could not deploy this published Workflow version")
    return environmentWorkflowBindingSchema.strip().parse(await response.json())
  })

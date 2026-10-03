import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import {
  connectionSchema,
  environmentConnectionsSchema,
  createGithubInstallationConnectionSchema,
  connectionAuthoritiesSchema,
  connectionAuthorityRecordSchema,
  connectorAccessPolicySchema,
  operatorConnectorAuditEventSchema,
} from "@linea/protocol/resources"
import { paginatedResponseSchema } from "@linea/protocol/shared"
import { apiFetch } from "./api-fetch"
const environmentInput = z.object({ environmentId: z.uuid() })
const connectionInput = environmentInput.extend({ connectionId: z.uuid() })
const assignmentInput = connectionInput.extend({
  kind: z.enum(["requester", "reviewer"]),
})
const paths = { requester: "access-grants", reviewer: "reviewer-assignments" }
async function response(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body: unknown
) {
  const result = await apiFetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  })
  if (!result.ok) {
    const error = z
      .object({ message: z.union([z.string(), z.array(z.string())]) })
      .safeParse(await result.json())
    throw new Error(
      error.success
        ? typeof error.data.message === "string"
          ? error.data.message
          : error.data.message.join(", ")
        : "Connection administration failed"
    )
  }
  const responseBody: unknown = await result.json()
  return responseBody
}
export const listSharedConnectionsFn = createServerFn({ method: "GET" })
  .inputValidator(environmentInput)
  .handler(async ({ data }) =>
    environmentConnectionsSchema.parse(
      await response(
        `/environments/${data.environmentId}/connections`,
        "GET",
        undefined
      )
    )
  )
export const createGithubInstallationFn = createServerFn({ method: "POST" })
  .inputValidator(
    createGithubInstallationConnectionSchema.extend({ environmentId: z.uuid() })
  )
  .handler(async ({ data: { environmentId, ...input } }) =>
    connectionSchema.parse(
      await response(
        `/environments/${environmentId}/connections/github-installations`,
        "POST",
        input
      )
    )
  )
export const listConnectionAuthoritiesFn = createServerFn({ method: "GET" })
  .inputValidator(connectionInput)
  .handler(async ({ data }) =>
    connectionAuthoritiesSchema.parse(
      await response(
        `/environments/${data.environmentId}/connections/${data.connectionId}/authorities`,
        "GET",
        undefined
      )
    )
  )
export const assignConnectionAuthorityFn = createServerFn({ method: "POST" })
  .inputValidator(assignmentInput.extend({ externalSubjectId: z.uuid() }))
  .handler(async ({ data }) =>
    connectionAuthorityRecordSchema.parse(
      await response(
        `/environments/${data.environmentId}/connections/${data.connectionId}/${paths[data.kind]}`,
        "POST",
        { externalSubjectId: data.externalSubjectId }
      )
    )
  )
export const revokeConnectionAuthorityFn = createServerFn({ method: "POST" })
  .inputValidator(assignmentInput.extend({ authorizationId: z.uuid() }))
  .handler(async ({ data }) =>
    connectionAuthorityRecordSchema.parse(
      await response(
        `/environments/${data.environmentId}/connections/${data.connectionId}/${paths[data.kind]}/${data.authorizationId}`,
        "DELETE",
        undefined
      )
    )
  )
export const revokeSharedConnectionFn = createServerFn({ method: "POST" })
  .inputValidator(connectionInput)
  .handler(async ({ data }) =>
    connectionSchema.parse(
      await response(
        `/environments/${data.environmentId}/connections/${data.connectionId}`,
        "DELETE",
        undefined
      )
    )
  )
export const replaceConnectorPolicyFn = createServerFn({ method: "POST" })
  .inputValidator(
    environmentInput.extend({ policy: connectorAccessPolicySchema })
  )
  .handler(async ({ data }) => {
    await response(
      `/environments/${data.environmentId}/connector-access-policy`,
      "PUT",
      data.policy
    )
  })
export const listEnvironmentConnectionOutcomesFn = createServerFn({
  method: "GET",
})
  .inputValidator(environmentInput.extend({ cursor: z.string().optional() }))
  .handler(async ({ data }) =>
    paginatedResponseSchema(operatorConnectorAuditEventSchema).parse(
      await response(
        `/audit-events?environmentId=${data.environmentId}&limit=20${data.cursor ? `&cursor=${encodeURIComponent(data.cursor)}` : ""}`,
        "GET",
        undefined
      )
    )
  )

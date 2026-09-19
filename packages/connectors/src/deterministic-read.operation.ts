import { z } from "zod"
import type { ConnectorReadOperation } from "./connector-read-operation.js"

const inputSchema = z.object({ resourceId: z.string().min(1).max(64) }).strict()
const providerResponseSchema = z
  .object({ resourceId: z.string().max(64), label: z.string().max(200) })
  .strip()
const outputSchema = z
  .object({ resourceId: z.string().max(64), label: z.string().max(200) })
  .strict()

function providerBaseUrl(): URL {
  const value = process.env.DETERMINISTIC_CONNECTOR_BASE_URL
  if (!value) throw new Error("Deterministic Connector provider unavailable")
  return new URL(value)
}

export const deterministicReadOperation: ConnectorReadOperation =
  Object.freeze<ConnectorReadOperation>({
    id: "deterministic.read",
    provider: "test",
    actionFamily: "test",
    classification: "read",
    requiredScopes: Object.freeze(["read:resources"]),
    providerErrorMessage: "Connector provider request failed",
    inputSchema,
    outputSchema,
    async execute(rawInput, credential, signal) {
      const input = inputSchema.parse(rawInput)
      const url = new URL(
        `/resources/${encodeURIComponent(input.resourceId)}`,
        providerBaseUrl()
      )
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${credential.accessToken}` },
        signal,
      })
      if (!response.ok) throw new Error("Deterministic provider request failed")
      const providerResponse = providerResponseSchema.parse(
        await response.json()
      )
      return outputSchema.parse(providerResponse)
    },
  })

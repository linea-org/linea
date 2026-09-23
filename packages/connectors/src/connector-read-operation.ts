import type { z } from "zod"

export type ConnectorReadCredential = {
  accountId: string
  accessToken: string
  expiresAt: string | null
  scopes: readonly string[]
}

export interface ConnectorReadOperation {
  readonly id: string
  readonly provider: string
  readonly actionFamily: string
  readonly classification: "read"
  readonly requiredScopes: readonly string[]
  readonly providerErrorMessage: string
  readonly inputSchema: z.ZodType
  readonly outputSchema: z.ZodType
  execute(
    input: unknown,
    credential: ConnectorReadCredential,
    signal?: AbortSignal
  ): Promise<unknown>
}

export type ConnectorOperationRegistry = Readonly<Record<string, unknown>>

function isConnectorReadOperation(
  value: unknown
): value is ConnectorReadOperation {
  return Boolean(
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "provider" in value &&
    typeof value.provider === "string" &&
    "actionFamily" in value &&
    typeof value.actionFamily === "string" &&
    "classification" in value &&
    value.classification === "read" &&
    "requiredScopes" in value &&
    Array.isArray(value.requiredScopes) &&
    value.requiredScopes.every((scope) => typeof scope === "string") &&
    "providerErrorMessage" in value &&
    typeof value.providerErrorMessage === "string" &&
    value.providerErrorMessage.length > 0 &&
    "inputSchema" in value &&
    value.inputSchema &&
    typeof value.inputSchema === "object" &&
    "parse" in value.inputSchema &&
    typeof value.inputSchema.parse === "function" &&
    "outputSchema" in value &&
    value.outputSchema &&
    typeof value.outputSchema === "object" &&
    "parse" in value.outputSchema &&
    typeof value.outputSchema.parse === "function" &&
    "execute" in value &&
    typeof value.execute === "function"
  )
}

export function registeredReadOperation(
  registry: ConnectorOperationRegistry,
  operationId: string
): ConnectorReadOperation | undefined {
  const value = registry[operationId]
  return isConnectorReadOperation(value) && value.id === operationId
    ? value
    : undefined
}

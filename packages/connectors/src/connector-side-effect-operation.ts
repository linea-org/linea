import type { ApprovalRequestDisplay } from "@linea/db"
import type { z } from "zod"
import type { IJsonValue } from "./action-intent-canonicalization.js"
import type {
  ConnectorOperationRegistry,
  ConnectorReadCredential,
} from "./connector-read-operation.js"

export type ActionIntentEnvelope = {
  version: 1
  operationRevision: string
  connectionId: string
  connector: string
  operation: string
  target: IJsonValue
  parameters: IJsonValue
  providerPreconditions: IJsonValue
}

export type NormalizedSideEffect = {
  target: IJsonValue
  parameters: IJsonValue
  providerPreconditions: IJsonValue
}

export type ConnectorProviderError = {
  code: string
  message: string
  outcomeUnknown: boolean
}

export interface ConnectorSideEffectOperation {
  readonly id: string
  readonly revision: string
  readonly provider: string
  readonly actionFamily: string
  readonly classification: "side_effect"
  readonly requiredScopes: readonly string[]
  readonly inputSchema: z.ZodType
  readonly parametersSchema: z.ZodType<IJsonValue>
  readonly preconditionsSchema: z.ZodType<IJsonValue>
  readonly resultSchema: z.ZodType<IJsonValue>
  readonly providerErrorSchema: z.ZodType<ConnectorProviderError>
  normalize(input: unknown): NormalizedSideEffect
  display(envelope: ActionIntentEnvelope): ApprovalRequestDisplay
  execute(
    parameters: unknown,
    providerPreconditions: unknown,
    credential: ConnectorReadCredential,
    invocationIdempotencyKey: string,
    signal?: AbortSignal
  ): Promise<unknown>
  normalizeProviderError(error: unknown): ConnectorProviderError
}

function schema(value: object, key: string): boolean {
  return (
    key in value &&
    Boolean(value[key as keyof typeof value]) &&
    typeof value[key as keyof typeof value] === "object" &&
    "parse" in (value[key as keyof typeof value] as object) &&
    typeof (value[key as keyof typeof value] as { parse?: unknown }).parse ===
      "function"
  )
}

function isConnectorSideEffectOperation(
  value: unknown
): value is ConnectorSideEffectOperation {
  if (!value || typeof value !== "object") return false
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "revision" in value &&
    typeof value.revision === "string" &&
    "provider" in value &&
    typeof value.provider === "string" &&
    "actionFamily" in value &&
    typeof value.actionFamily === "string" &&
    "classification" in value &&
    value.classification === "side_effect" &&
    "requiredScopes" in value &&
    Array.isArray(value.requiredScopes) &&
    value.requiredScopes.every((scope) => typeof scope === "string") &&
    schema(value, "inputSchema") &&
    schema(value, "parametersSchema") &&
    schema(value, "preconditionsSchema") &&
    schema(value, "resultSchema") &&
    schema(value, "providerErrorSchema") &&
    "normalize" in value &&
    typeof value.normalize === "function" &&
    "display" in value &&
    typeof value.display === "function" &&
    "execute" in value &&
    typeof value.execute === "function" &&
    "normalizeProviderError" in value &&
    typeof value.normalizeProviderError === "function"
  )
}

export function registeredSideEffectOperation(
  registry: ConnectorOperationRegistry,
  operationId: string
): ConnectorSideEffectOperation | undefined {
  const value = registry[operationId]
  return isConnectorSideEffectOperation(value) && value.id === operationId
    ? value
    : undefined
}

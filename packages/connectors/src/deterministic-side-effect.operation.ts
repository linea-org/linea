import { z } from "zod"
import type {
  ActionIntentEnvelope,
  ConnectorProviderError,
  ConnectorSideEffectOperation,
} from "./connector-side-effect-operation.js"
import { escapeSafeDisplayText } from "./safe-display.js"

const inputSchema = z
  .object({
    resourceId: z.string().min(1).max(64),
    value: z.string().min(1).max(200),
    secret: z.string().min(1).max(200),
    expectedVersion: z.string().min(1).max(64),
  })
  .strict()
const parametersSchema = z
  .object({
    resourceId: z.string().min(1).max(64),
    value: z.string().min(1).max(200),
    secret: z.string().min(1).max(200),
  })
  .strict()
const preconditionsSchema = z
  .object({ expectedVersion: z.string().min(1).max(64) })
  .strict()
const resultSchema = z
  .object({
    resourceId: z.string().max(64),
    value: z.string().max(200),
    version: z.string().max(64),
  })
  .strict()
const providerResponseSchema = resultSchema.strip()
const providerErrorSchema = z.strictObject({
  code: z.enum(["precondition_failed", "provider_failed", "outcome_unknown"]),
  message: z.string().max(200),
  outcomeUnknown: z.boolean(),
})

class DeterministicProviderError extends Error {
  constructor(readonly status: number) {
    super("Deterministic provider request failed")
  }
}

function providerBaseUrl(): URL {
  const value = process.env.DETERMINISTIC_CONNECTOR_BASE_URL
  if (!value) throw new Error("Deterministic Connector provider unavailable")
  return new URL(value)
}

function envelopeParameters(envelope: ActionIntentEnvelope) {
  return parametersSchema.parse(envelope.parameters)
}

export const deterministicSideEffectOperation: ConnectorSideEffectOperation =
  Object.freeze<ConnectorSideEffectOperation>({
    id: "deterministic.update",
    revision: "1",
    provider: "test",
    actionFamily: "test",
    classification: "side_effect",
    requiredScopes: Object.freeze(["write:resources"]),
    inputSchema,
    parametersSchema,
    preconditionsSchema,
    resultSchema,
    providerErrorSchema,
    normalize(rawInput) {
      const input = inputSchema.parse(rawInput)
      return {
        target: { resourceId: input.resourceId },
        parameters: {
          resourceId: input.resourceId,
          value: input.value.trim(),
          secret: input.secret,
        },
        providerPreconditions: { expectedVersion: input.expectedVersion },
      }
    },
    display(envelope) {
      const parameters = envelopeParameters(envelope)
      return Object.freeze({
        title: "Update resource",
        details: Object.freeze({
          Resource: escapeSafeDisplayText(parameters.resourceId),
          Value: escapeSafeDisplayText(parameters.value),
        }),
      })
    },
    async execute(
      rawParameters,
      rawPreconditions,
      credential,
      invocationIdempotencyKey,
      signal
    ) {
      const parameters = parametersSchema.parse(rawParameters)
      const preconditions = preconditionsSchema.parse(rawPreconditions)
      const response = await fetch(
        new URL(
          `/resources/${encodeURIComponent(parameters.resourceId)}`,
          providerBaseUrl()
        ),
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${credential.accessToken}`,
            "content-type": "application/json",
            "if-match": preconditions.expectedVersion,
            "idempotency-key": invocationIdempotencyKey,
          },
          body: JSON.stringify({
            value: parameters.value,
            secret: parameters.secret,
          }),
          signal,
        }
      )
      if (!response.ok) throw new DeterministicProviderError(response.status)
      return providerResponseSchema.parse(await response.json())
    },
    normalizeProviderError(error): ConnectorProviderError {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          code: "outcome_unknown",
          message: "Connector provider outcome is unknown",
          outcomeUnknown: true,
        }
      }
      if (error instanceof DeterministicProviderError && error.status === 412) {
        return {
          code: "precondition_failed",
          message: "Connector target changed before execution",
          outcomeUnknown: false,
        }
      }
      if (error instanceof DeterministicProviderError && error.status === 504) {
        return {
          code: "outcome_unknown",
          message: "Connector provider outcome is unknown",
          outcomeUnknown: true,
        }
      }
      if (error instanceof DeterministicProviderError) {
        return {
          code: "provider_failed",
          message: "Connector provider request failed",
          outcomeUnknown: false,
        }
      }
      return {
        code: "outcome_unknown",
        message: "Connector provider outcome is unknown",
        outcomeUnknown: true,
      }
    },
  })

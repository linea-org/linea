import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"
import { modelOptions } from "../model-options.js"
import { retryPolicySchema } from "../retry-policy.js"

export type ExtractionSchema = Record<string, unknown>

export function parseExtractionSchema(schema: ExtractionSchema) {
  if (schema.type !== "object") {
    throw new Error('Extraction schema must have type "object"')
  }
  try {
    return z.fromJSONSchema(schema)
  } catch (error) {
    throw new Error(
      `Invalid extraction schema: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const extractInputSchema = z
  .object({
    model: z.string(),
    instructions: z.string().min(1),
    sourcePath: z.string().optional(),
    schema: z.record(z.string(), z.unknown()),
    retryPolicy: retryPolicySchema.optional(),
  })
  .superRefine((config, context) => {
    try {
      parseExtractionSchema(config.schema)
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
        path: ["schema"],
      })
    }
  })

const extractOutputSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  tokensInput: z.number(),
  tokensOutput: z.number(),
})

export const extractNode: NodeDefinition<
  z.infer<typeof extractInputSchema>,
  z.infer<typeof extractOutputSchema>
> = {
  id: "extract",
  inputSchema: extractInputSchema,
  outputSchema: extractOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Extract",
    description: "Extract validated fields from text with a model.",
    category: "ai",
    icon: "scan-text",
    fields: [
      {
        key: "model",
        label: "Model",
        widget: "select",
        options: modelOptions,
      },
      {
        key: "sourcePath",
        label: "Source path",
        widget: "text",
        description:
          "Dot-path to the text in this node's input, such as text. Leave empty when the input is already text.",
      },
      {
        key: "instructions",
        label: "Extraction instructions",
        widget: "textarea",
        description:
          "Describe what the model should extract from the source text.",
      },
      {
        key: "schema",
        label: "Output schema",
        widget: "code",
        description:
          "JSON Schema for the extracted object. Required fields must be listed in required.",
      },
      {
        key: "retryPolicy",
        label: "Retry policy",
        widget: "code",
        description:
          'Retry provider failures. JSON: {"maxAttempts": 3, "backoff": {"type": "exponential", "delayMs": 500}, "timeoutMs": 30000}. Leave empty for no retry.',
      },
    ],
    summaryField: "model",
  },
}

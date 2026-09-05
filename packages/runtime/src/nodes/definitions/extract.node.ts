import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"
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
        options: [
          { label: "Claude Opus 5", value: "claude-opus-5" },
          { label: "Claude Sonnet 5", value: "claude-sonnet-5" },
          { label: "Claude Fable 5", value: "claude-fable-5" },
          { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
          { label: "GPT-5", value: "gpt-5" },
          { label: "GPT-5 mini", value: "gpt-5-mini" },
          { label: "GPT-4.1", value: "gpt-4.1" },
          { label: "GPT-4o", value: "gpt-4o" },
          { label: "GPT-OSS 120B (Groq)", value: "openai/gpt-oss-120b" },
          { label: "GPT-OSS 20B (Groq)", value: "openai/gpt-oss-20b" },
          { label: "Compound (Groq)", value: "groq/compound" },
          { label: "Compound mini (Groq)", value: "groq/compound-mini" },
          { label: "Grok 4.5", value: "grok-4.5" },
        ],
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

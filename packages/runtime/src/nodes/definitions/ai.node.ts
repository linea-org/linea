import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"
import { modelOptions } from "../model-options.js"
import { retryPolicySchema } from "../retry-policy.js"

const aiToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  // JSON Schema object describing the tool's parameters, sent to the provider as-is.
  parameters: z.record(z.string(), z.unknown()).default({}),
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
})

const aiInputSchema = z.object({
  prompt: z.string(),
  model: z.string(),
  systemPrompt: z.string().optional(),
  // Set by the runtime from the execution's trigger payload, not authored on the node — when present, prior turns for this conversation are fetched and sent as message history.
  conversationId: z.string().optional(),
  // Empty/omitted keeps today's exact one-shot completion behavior — no tool-calling loop.
  tools: z.array(aiToolSchema).optional(),
  // Not yet UI-exposed — caps the tool-calling loop; defaulted by the execution-worker handler.
  maxIterations: z.number().int().positive().optional(),
  // Empty/omitted keeps today's exact behavior — no memory lookup at all.
  memorySubjectPath: z.string().optional(),
  memoryNamespace: z.string().optional(),
  // Interpreter-owned; omitted means no retry. Completions are not idempotent.
  retryPolicy: retryPolicySchema.optional(),
})

const aiOutputSchema = z.object({
  text: z.string(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
})

export const aiNode: NodeDefinition<
  z.infer<typeof aiInputSchema>,
  z.infer<typeof aiOutputSchema>
> = {
  id: "ai",
  inputSchema: aiInputSchema,
  outputSchema: aiOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Agent",
    description: "Prompt a model and use its response.",
    category: "ai",
    icon: "sparkles",
    fields: [
      {
        key: "model",
        label: "Model",
        widget: "select",
        // Matches packages/ai/src/registry.ts exactly — every value here must resolve to a real provider.
        options: modelOptions,
      },
      {
        key: "systemPrompt",
        label: "System prompt",
        widget: "textarea",
        description:
          "Sets the model's persona and rules for every run — not interpolated with node data.",
      },
      {
        key: "prompt",
        label: "Prompt",
        widget: "textarea",
        description:
          "The actual task for this run — reference upstream node output here.",
      },
      {
        key: "tools",
        label: "Tools",
        widget: "code",
        description:
          "Optional HTTP tools the model can call: JSON array of {name, description, parameters (JSON Schema), url, method}. Leave empty for a single-shot completion.",
      },
      {
        key: "memorySubjectPath",
        label: "Memory subject path",
        widget: "text",
        description:
          "Dot-path into this node's input identifying whose memory to recall (e.g. your app's own user id) — not a Linea user. Leave empty to skip memory entirely.",
      },
      {
        key: "memoryNamespace",
        label: "Memory namespace",
        widget: "text",
        description:
          "Leave empty to isolate memory to this workflow. Set the same value as a Memory node writing to it to read what it wrote.",
      },
      {
        key: "retryPolicy",
        label: "Retry policy",
        widget: "code",
        description:
          'Retry a failed completion. Warning: no supported provider has an idempotency mechanism for completions, so a retry after a slow/dropped response can bill twice. JSON: {"maxAttempts": 3, "backoff": {"type": "exponential", "delayMs": 500}, "timeoutMs": 30000}. Leave empty for no retry.',
      },
    ],
    summaryField: "model",
  },
}

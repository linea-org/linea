import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

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
    ],
    summaryField: "model",
  },
}

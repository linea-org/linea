import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const mergeInputSchema = z.object({
  mode: z.enum(["concat", "deepMerge", "zip"]),
  // Required for deepMerge/zip — n8n's own lesson: an explicit strategy field, never an implicit
  // last-wins/first-wins default.
  conflictStrategy: z.enum(["preferFirst", "preferSecond"]).optional(),
  // Always exactly 2 — the two predecessors' outputs, in edge-declaration order. Runtime value,
  // not config, same as Branch's "value" / Transform's "input".
  inputs: z.tuple([z.unknown(), z.unknown()]),
})

const mergeOutputSchema = z.object({
  result: z.unknown(),
})

export const mergeNode: NodeDefinition<
  z.infer<typeof mergeInputSchema>,
  z.infer<typeof mergeOutputSchema>
> = {
  id: "merge",
  inputSchema: mergeInputSchema,
  outputSchema: mergeOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Merge",
    description:
      "Combine two upstream paths into one — concat, deep-merge, or zip.",
    category: "data",
    icon: "merge",
    // "inputs" is the runtime value from both predecessors, not config.
    fields: [
      {
        key: "mode",
        label: "Mode",
        widget: "select",
        options: [
          { label: "Concat (arrays)", value: "concat" },
          { label: "Deep merge (objects)", value: "deepMerge" },
          { label: "Zip by position (arrays)", value: "zip" },
        ],
      },
      {
        key: "conflictStrategy",
        label: "On key conflict",
        widget: "select",
        options: [
          { label: "Prefer first input", value: "preferFirst" },
          { label: "Prefer second input", value: "preferSecond" },
        ],
        showIf: { key: "mode", equals: ["deepMerge", "zip"] },
      },
    ],
    summaryField: "mode",
  },
}

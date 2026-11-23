import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

export const MIN_MERGE_INPUTS = 2
export const MAX_MERGE_INPUTS = 5

const mergeInputSchema = z.object({
  mode: z.enum(["concat", "deepMerge", "zip"]),
  // Required for deepMerge/zip — n8n's own lesson: an explicit strategy field, never an implicit
  // last-wins/first-wins default.
  conflictStrategy: z.enum(["preferFirst", "preferSecond"]).optional(),
  // The predecessors' outputs, in edge-declaration order. Runtime value, not config, same as
  // Branch's "value" / Transform's "input".
  inputs: z.array(z.unknown()).min(MIN_MERGE_INPUTS).max(MAX_MERGE_INPUTS),
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
      "Combine two to five upstream paths into one — concat, deep-merge, or zip.",
    category: "data",
    icon: "merge",
    // "inputs" is the runtime value from the predecessors, not config.
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
          { label: "Prefer earlier input", value: "preferFirst" },
          { label: "Prefer later input", value: "preferSecond" },
        ],
        showIf: { key: "mode", equals: ["deepMerge", "zip"] },
      },
    ],
    summaryField: "mode",
  },
}

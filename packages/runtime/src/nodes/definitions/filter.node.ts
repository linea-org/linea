import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"

const filterOperatorSchema = z.enum([
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
  "isEmpty",
  "isNotEmpty",
  "exists",
  "notExists",
])

const filterConditionSchema = z.object({
  // Dot-path into each array item, e.g. "user.age" — same convention as the Transform node.
  path: z.string(),
  operator: filterOperatorSchema,
  // Unused by isEmpty/isNotEmpty/exists/notExists.
  value: z.unknown().optional(),
})

const filterInputSchema = z.object({
  items: z.array(z.unknown()),
  conditions: z.array(filterConditionSchema).default([]),
  // AND/OR only, never mixed within one node — matches n8n's own Filter node.
  combinator: z.enum(["and", "or"]).default("and"),
})

const filterOutputSchema = z.object({
  items: z.array(z.unknown()),
})

export const filterNode: NodeDefinition<
  z.infer<typeof filterInputSchema>,
  z.infer<typeof filterOutputSchema>
> = {
  id: "filter",
  inputSchema: filterInputSchema,
  outputSchema: filterOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Filter",
    description: "Keep only the array items matching a condition.",
    category: "data",
    icon: "filter",
    // "items" is the runtime input, not config — the handler reads config.conditions/combinator.
    fields: [
      {
        key: "conditions",
        label: "Conditions",
        widget: "code",
        description:
          "JSON array of {path, operator, value}. Operators: equals, notEquals, contains, notContains, greaterThan, lessThan, greaterThanOrEqual, lessThanOrEqual, isEmpty, isNotEmpty, exists, notExists.",
      },
      {
        key: "combinator",
        label: "Combine conditions with",
        widget: "select",
        options: [
          { label: "AND (all must match)", value: "and" },
          { label: "OR (any must match)", value: "or" },
        ],
      },
    ],
    summaryField: "combinator",
  },
}

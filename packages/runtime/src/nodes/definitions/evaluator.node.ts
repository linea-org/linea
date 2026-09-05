import { z } from "zod"
import type { NodeDefinition } from "../node-definition.js"
import { modelOptions } from "../model-options.js"
import { retryPolicySchema } from "../retry-policy.js"

const metricBase = {
  id: z.string().min(1),
  revision: z.number().int().positive().default(1),
  name: z.string().min(1),
}

const containsMetricSchema = z.object({
  ...metricBase,
  type: z.literal("contains"),
  value: z.string().min(1),
})

const notContainsMetricSchema = z.object({
  ...metricBase,
  type: z.literal("not_contains"),
  value: z.string().min(1),
})

const regexMetricSchema = z.object({
  ...metricBase,
  type: z.literal("regex"),
  pattern: z.string().min(1),
  flags: z.string().optional(),
})

export const evaluationParameterSchema = z.enum([
  "input",
  "actualOutput",
  "expectedOutput",
  "context",
  "retrievalContext",
])

const gEvalMetricSchema = z
  .object({
    ...metricBase,
    type: z.literal("g_eval"),
    threshold: z.number().min(0).max(1).default(0.8),
    criteria: z.string().min(1).optional(),
    evaluationSteps: z.array(z.string().min(1)).min(1).optional(),
    evaluationParams: z
      .array(evaluationParameterSchema)
      .min(1)
      .default(["actualOutput"]),
  })
  .superRefine((metric, context) => {
    if (
      (metric.criteria === undefined) ===
      (metric.evaluationSteps === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Provide either criteria or evaluationSteps, but not both",
      })
    }
    if (!metric.evaluationParams.includes("actualOutput")) {
      context.addIssue({
        code: "custom",
        message: "evaluationParams must include actualOutput",
        path: ["evaluationParams"],
      })
    }
  })

export const evaluationMetricSchema = z.discriminatedUnion("type", [
  containsMetricSchema,
  notContainsMetricSchema,
  regexMetricSchema,
  gEvalMetricSchema,
])

const evaluationSampleBindingsSchema = z.object({
  inputPath: z.string().min(1).optional(),
  actualOutputPath: z.string().min(1).optional(),
  expectedOutputPath: z.string().min(1).optional(),
  contextPath: z.string().min(1).optional(),
  retrievalContextPath: z.string().min(1).optional(),
})

const evaluatorInputSchema = z
  .object({
    sample: evaluationSampleBindingsSchema.default({}),
    metrics: z.array(evaluationMetricSchema).min(1),
    model: z.string().min(1).optional(),
    retryPolicy: retryPolicySchema.optional(),
  })
  .superRefine((config, context) => {
    const metricIds = config.metrics.map((metric) => metric.id)
    if (new Set(metricIds).size !== metricIds.length) {
      context.addIssue({
        code: "custom",
        message: "Metric ids must be unique",
        path: ["metrics"],
      })
    }
    if (
      config.metrics.some((metric) => metric.type === "g_eval") &&
      config.model === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "A model is required when metrics include g_eval",
        path: ["model"],
      })
    }
    for (const [index, metric] of config.metrics.entries()) {
      if (metric.type !== "regex") continue
      try {
        new RegExp(metric.pattern, metric.flags)
      } catch (error) {
        context.addIssue({
          code: "custom",
          message: error instanceof Error ? error.message : String(error),
          path: ["metrics", index, "pattern"],
        })
      }
    }
  })

export const evaluationMetricResultSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  name: z.string(),
  type: z.enum(["contains", "not_contains", "regex", "g_eval"]),
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  passed: z.boolean(),
  reason: z.string(),
  model: z.string().optional(),
  evaluationSteps: z.array(z.string()).optional(),
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
})

const evaluatorOutputSchema = z.object({
  input: z.unknown(),
  sample: z.object({
    input: z.unknown().optional(),
    actualOutput: z.unknown(),
    expectedOutput: z.unknown().optional(),
    context: z.unknown().optional(),
    retrievalContext: z.unknown().optional(),
  }),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  metrics: z.array(evaluationMetricResultSchema).min(1),
  tokensInput: z.number().int().nonnegative(),
  tokensOutput: z.number().int().nonnegative(),
})

export type EvaluationParameter = z.infer<typeof evaluationParameterSchema>
export type EvaluationMetric = z.infer<typeof evaluationMetricSchema>
export type EvaluationSampleBindings = z.infer<
  typeof evaluationSampleBindingsSchema
>
export type EvaluatorConfig = z.infer<typeof evaluatorInputSchema>
export type EvaluationMetricResult = z.infer<
  typeof evaluationMetricResultSchema
>

export const evaluatorNode: NodeDefinition<
  EvaluatorConfig,
  z.infer<typeof evaluatorOutputSchema>
> = {
  id: "evaluator",
  inputSchema: evaluatorInputSchema,
  outputSchema: evaluatorOutputSchema,
  needsSandbox: false,
  ui: {
    label: "Evaluator",
    description: "Score an output with deterministic rules or model judges.",
    category: "ai",
    icon: "clipboard-check",
    fields: [
      {
        key: "model",
        label: "Judge model",
        widget: "select",
        options: modelOptions,
        optional: true,
        description: "Required when any metric uses g_eval.",
      },
      {
        key: "sample",
        label: "Sample bindings",
        widget: "code",
        description:
          "JSON dot-paths for input, actualOutput, expectedOutput, context, and retrievalContext. An empty actualOutputPath evaluates the whole incoming value.",
      },
      {
        key: "metrics",
        label: "Metrics",
        widget: "code",
        description:
          'JSON array of named metrics. Example: [{"id":"correctness","name":"Correctness","type":"g_eval","criteria":"Determine whether actualOutput is correct.","threshold":0.8,"evaluationParams":["actualOutput","expectedOutput"]}]. Increment revision when changing a metric.',
      },
      {
        key: "retryPolicy",
        label: "Retry policy",
        widget: "code",
        description:
          'Retry judge provider failures. JSON: {"maxAttempts": 3, "backoff": {"type": "exponential", "delayMs": 500}, "timeoutMs": 30000}. Leave empty for no retry.',
      },
    ],
  },
}

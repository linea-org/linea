import { Injectable } from "@nestjs/common"
import {
  evaluationMetricResultSchema,
  nodeRegistry,
  type EvaluatorConfig,
  type EvaluationMetricResult,
} from "@linea/runtime"
import { resolveApiKey, resolveKeyName, resolveProvider } from "@linea/ai"
import { db, repositories, type EvaluatorNodeProgressState } from "@linea/db"
import { LeaseLostError } from "../../checkpoints/checkpoints.service"
import {
  buildEvaluationSample,
  EvaluationResponseError,
  evaluateRuleMetric,
  generateEvaluationSteps,
  scoreEvaluationSample,
  validateEvaluationParameters,
  type EvaluationSample,
} from "../../evaluation/evaluation-engine"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"
import { NonRetryableError } from "./non-retryable-error"
import { RetryableUsageError, UsageError } from "./usage-error"

function parseConfig(config: Record<string, unknown>): EvaluatorConfig {
  const result = nodeRegistry.evaluator.inputSchema.safeParse(config)
  if (!result.success) {
    throw new NonRetryableError(
      `Evaluator node has invalid configuration: ${result.error.message}`,
      { cause: result.error }
    )
  }
  return result.data
}

@Injectable()
export class EvaluatorNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const parsed = parseConfig(config)
    let sample: EvaluationSample
    try {
      sample = buildEvaluationSample(input, parsed.sample)
    } catch (error) {
      throw new NonRetryableError(
        `Evaluator node has invalid sample bindings: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    const metrics: EvaluationMetricResult[] = []
    const nodeKey =
      context.executionId && context.nodeId && context.leasedBy
        ? {
            executionId: context.executionId,
            nodeId: context.nodeId,
            leasedBy: context.leasedBy,
          }
        : undefined
    const savedProgress = nodeKey
      ? await repositories.evaluatorNodeProgress.getEvaluatorNodeProgress(
          db,
          nodeKey.executionId,
          nodeKey.nodeId
        )
      : undefined
    const progress: EvaluatorNodeProgressState = savedProgress?.state ?? {
      version: 1,
      metrics: {},
    }
    let tokensInput = savedProgress?.tokensInput ?? 0
    let tokensOutput = savedProgress?.tokensOutput ?? 0
    const saveProgress = async () => {
      if (!nodeKey) return
      const saved =
        await repositories.evaluatorNodeProgress.saveEvaluatorNodeProgress(db, {
          ...nodeKey,
          state: progress,
          tokensInput,
          tokensOutput,
        })
      if (!saved) throw new LeaseLostError(nodeKey.executionId)
    }
    let judge:
      | {
          model: string
          provider: ReturnType<typeof resolveProvider>
          apiKey: string
        }
      | undefined
    const getJudge = async () => {
      if (judge) return judge
      if (!parsed.model) {
        throw new NonRetryableError("Evaluator node requires a judge model")
      }
      const keyName = resolveKeyName(parsed.model)
      const { apiKey } = await resolveApiKey(db, context.workspaceId, keyName)
      judge = {
        model: parsed.model,
        provider: resolveProvider(parsed.model),
        apiKey,
      }
      return judge
    }
    for (const metric of parsed.metrics) {
      if (metric.type === "g_eval") {
        try {
          validateEvaluationParameters(sample, metric.evaluationParams)
        } catch (error) {
          throw new NonRetryableError(
            `Evaluator node metric "${metric.name}" has invalid sample bindings: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
          )
        }
        const savedMetric = progress.metrics[metric.id]
        if (
          savedMetric?.revision === metric.revision &&
          savedMetric.result !== undefined
        ) {
          const result = evaluationMetricResultSchema.parse(savedMetric.result)
          metrics.push(result)
          continue
        }
        const metricProgress =
          savedMetric?.revision === metric.revision
            ? savedMetric
            : {
                revision: metric.revision,
                tokensInput: 0,
                tokensOutput: 0,
              }
        try {
          const resolvedJudge = await getJudge()
          const cacheKey =
            context.workflowVersionId && context.nodeId
              ? {
                  workflowVersionId: context.workflowVersionId,
                  nodeId: context.nodeId,
                  metricId: metric.id,
                  metricRevision: metric.revision,
                }
              : undefined
          const cachedSteps =
            !metric.evaluationSteps && !metricProgress.steps && cacheKey
              ? await repositories.evaluatorMetricSteps.getEvaluatorMetricSteps(
                  db,
                  cacheKey
                )
              : undefined
          let steps =
            metric.evaluationSteps ?? metricProgress.steps ?? cachedSteps?.steps
          if (!steps) {
            const generated = await generateEvaluationSteps(
              resolvedJudge.provider,
              resolvedJudge.apiKey,
              resolvedJudge.model,
              metric.criteria ?? "",
              context.signal
            )
            steps = generated.steps
            metricProgress.tokensInput += generated.tokensInput
            metricProgress.tokensOutput += generated.tokensOutput
            tokensInput += generated.tokensInput
            tokensOutput += generated.tokensOutput
            if (cacheKey) {
              steps =
                await repositories.evaluatorMetricSteps.saveEvaluatorMetricSteps(
                  db,
                  { ...cacheKey, steps }
                )
            }
          }
          if (!metric.evaluationSteps && !metricProgress.steps) {
            metricProgress.steps = steps
            progress.metrics[metric.id] = metricProgress
            await saveProgress()
          }
          const judged = await scoreEvaluationSample(
            resolvedJudge.provider,
            resolvedJudge.apiKey,
            resolvedJudge.model,
            metric,
            sample,
            steps,
            context.signal
          )
          metricProgress.tokensInput += judged.tokensInput
          metricProgress.tokensOutput += judged.tokensOutput
          tokensInput += judged.tokensInput
          tokensOutput += judged.tokensOutput
          const result: EvaluationMetricResult = {
            id: metric.id,
            revision: metric.revision,
            name: metric.name,
            type: metric.type,
            score: judged.score,
            threshold: metric.threshold,
            passed: judged.score >= metric.threshold,
            reason: judged.reason,
            model: resolvedJudge.model,
            evaluationSteps: steps,
            tokensInput: metricProgress.tokensInput,
            tokensOutput: metricProgress.tokensOutput,
          }
          metrics.push(result)
          metricProgress.result = result
          progress.metrics[metric.id] = metricProgress
          await saveProgress()
        } catch (error) {
          if (error instanceof EvaluationResponseError) {
            throw new UsageError(
              error.message,
              tokensInput + error.tokensInput,
              tokensOutput + error.tokensOutput,
              { cause: error }
            )
          }
          if (
            !(error instanceof LeaseLostError) &&
            (tokensInput > 0 || tokensOutput > 0)
          ) {
            throw new RetryableUsageError(
              error instanceof Error ? error.message : String(error),
              tokensInput,
              tokensOutput,
              { cause: error }
            )
          }
          throw error
        }
        continue
      }
      try {
        metrics.push(evaluateRuleMetric(sample, metric))
      } catch (error) {
        throw new NonRetryableError(
          `Evaluator node metric "${metric.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        )
      }
    }
    return nodeRegistry.evaluator.outputSchema.parse({
      input,
      sample,
      passed: metrics.every((metric) => metric.passed),
      score:
        metrics.reduce((total, metric) => total + metric.score, 0) /
        metrics.length,
      metrics,
      tokensInput,
      tokensOutput,
    })
  }
}

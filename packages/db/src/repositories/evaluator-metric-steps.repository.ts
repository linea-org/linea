import { and, eq } from "drizzle-orm"
import { evaluatorMetricSteps } from "../schema/index.js"
import type { DbClient } from "./types.js"

type EvaluatorMetricStepsKey = {
  workflowVersionId: string
  nodeId: string
  metricId: string
  metricRevision: number
}

export async function getEvaluatorMetricSteps(
  db: DbClient,
  key: EvaluatorMetricStepsKey
) {
  const [row] = await db
    .select()
    .from(evaluatorMetricSteps)
    .where(
      and(
        eq(evaluatorMetricSteps.workflowVersionId, key.workflowVersionId),
        eq(evaluatorMetricSteps.nodeId, key.nodeId),
        eq(evaluatorMetricSteps.metricId, key.metricId),
        eq(evaluatorMetricSteps.metricRevision, key.metricRevision)
      )
    )
    .limit(1)
  return row
}

export async function saveEvaluatorMetricSteps(
  db: DbClient,
  key: EvaluatorMetricStepsKey & { steps: string[] }
): Promise<string[]> {
  const [inserted] = await db
    .insert(evaluatorMetricSteps)
    .values(key)
    .onConflictDoNothing({
      target: [
        evaluatorMetricSteps.workflowVersionId,
        evaluatorMetricSteps.nodeId,
        evaluatorMetricSteps.metricId,
        evaluatorMetricSteps.metricRevision,
      ],
    })
    .returning({ steps: evaluatorMetricSteps.steps })
  if (inserted) return inserted.steps
  const existing = await getEvaluatorMetricSteps(db, key)
  if (!existing) {
    throw new Error("Evaluator metric steps disappeared after a cache conflict")
  }
  return existing.steps
}

import { sql } from "drizzle-orm"
import {
  executions,
  executionSteps,
  flags,
  type Execution,
  type Signal,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export const SIGNAL_DIMENSIONS_WINDOW_DAYS = 30
const SUFFICIENT_SAMPLE_SIZE = 5
const SUPPORTED_FLAG_TYPES = new Set<Signal["flagType"]>([
  "empty_response",
  "refusal",
])

type SignalDimensionRow = {
  model: string
  provider: string | null
  occurrences: number
  totalRuns: number
}

export type SignalDimension = SignalDimensionRow & {
  rate: number
  baselineOccurrences: number
  baselineRuns: number
  baselineRate: number | null
  lift: number | null
  comparison: "available" | "only-model-observed" | "no-baseline-occurrences"
  sampleStatus: "sufficient" | "limited"
}

export type SignalDimensions = {
  dimensionsApplicable: boolean
  attributedRuns: number
  totalRuns: number
  dimensions: SignalDimension[]
}

export async function getSignalDimensions(
  db: DbClient,
  signal: Signal,
  environment: Execution["environment"]
): Promise<SignalDimensions> {
  if (
    !signal.workflowId ||
    !signal.nodeId ||
    !SUPPORTED_FLAG_TYPES.has(signal.flagType)
  ) {
    return {
      dimensionsApplicable: false,
      attributedRuns: 0,
      totalRuns: 0,
      dimensions: [],
    }
  }
  const since = new Date(
    Date.now() - SIGNAL_DIMENSIONS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  )
  const coverage = await db.execute<{
    attributedRuns: number
    totalRuns: number
  }>(sql`
    SELECT
      count(*) FILTER (WHERE ${executionSteps.model} IS NOT NULL)::int AS "attributedRuns",
      count(*)::int AS "totalRuns"
    FROM ${executionSteps}
    INNER JOIN ${executions}
      ON ${executions.id} = ${executionSteps.executionId}
    WHERE ${executions.workspaceId} = ${signal.workspaceId}
      AND ${executions.workflowId} = ${signal.workflowId}
      AND ${executions.environment} = ${environment}
      AND ${executions.origin} = 'native'
      AND ${executionSteps.nodeId} = ${signal.nodeId}
      AND ${executionSteps.name} = 'ai'
      AND ${executionSteps.status} = 'succeeded'
      AND ${executionSteps.replayedFromStepId} IS NULL
      AND ${executionSteps.endedAt} >= ${since}
  `)
  const result = await db.execute<SignalDimensionRow>(sql`
    WITH eligible AS (
      SELECT
        ${executionSteps.id} AS id,
        ${executionSteps.model} AS model,
        ${executionSteps.provider} AS provider
      FROM ${executionSteps}
      INNER JOIN ${executions}
        ON ${executions.id} = ${executionSteps.executionId}
      WHERE ${executions.workspaceId} = ${signal.workspaceId}
        AND ${executions.workflowId} = ${signal.workflowId}
        AND ${executions.environment} = ${environment}
        AND ${executions.origin} = 'native'
        AND ${executionSteps.nodeId} = ${signal.nodeId}
        AND ${executionSteps.name} = 'ai'
        AND ${executionSteps.status} = 'succeeded'
        AND ${executionSteps.replayedFromStepId} IS NULL
        AND ${executionSteps.model} IS NOT NULL
        AND ${executionSteps.endedAt} >= ${since}
    )
    SELECT
      eligible.model AS model,
      eligible.provider AS provider,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM ${flags}
          WHERE ${flags.signalId} = ${signal.id}
            AND ${flags.detail}->>'stepId' = eligible.id::text
        )
      )::int AS occurrences,
      count(*)::int AS "totalRuns"
    FROM eligible
    GROUP BY eligible.model, eligible.provider
  `)
  const totalOccurrences = result.rows.reduce(
    (total, row) => total + row.occurrences,
    0
  )
  const totalRuns = result.rows.reduce((total, row) => total + row.totalRuns, 0)
  const dimensions = result.rows
    .map((row): SignalDimension => {
      const baselineOccurrences = totalOccurrences - row.occurrences
      const baselineRuns = totalRuns - row.totalRuns
      const rate = row.occurrences / row.totalRuns
      const baselineRate =
        baselineRuns > 0 ? baselineOccurrences / baselineRuns : null
      const comparison =
        baselineRuns === 0
          ? "only-model-observed"
          : baselineOccurrences === 0
            ? "no-baseline-occurrences"
            : "available"
      return {
        ...row,
        rate,
        baselineOccurrences,
        baselineRuns,
        baselineRate,
        lift:
          comparison === "available" && baselineRate !== null
            ? rate / baselineRate
            : null,
        comparison,
        sampleStatus:
          row.totalRuns >= SUFFICIENT_SAMPLE_SIZE &&
          baselineRuns >= SUFFICIENT_SAMPLE_SIZE
            ? "sufficient"
            : "limited",
      }
    })
    .sort((a, b) => b.rate - a.rate)
  return {
    dimensionsApplicable: true,
    attributedRuns: coverage.rows[0]?.attributedRuns ?? 0,
    totalRuns: coverage.rows[0]?.totalRuns ?? 0,
    dimensions,
  }
}

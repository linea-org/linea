import { and, eq, isNotNull, sql } from "drizzle-orm"
import {
  executions,
  executionSteps,
  flags,
  type Flag,
  type NewFlag,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createFlagIfNew(
  db: DbClient,
  input: NewFlag
): Promise<Flag | undefined> {
  const [flag] = await db
    .insert(flags)
    .values(input)
    .onConflictDoNothing({ target: flags.dedupeKey })
    .returning()
  return flag
}

export type RetryStormResult = {
  executionId: string
  workspaceId: string
  nodeId: string
  maxAttempt: number
}

export async function detectRetryStorm(
  db: DbClient,
  minAttempt = 3
): Promise<RetryStormResult[]> {
  const rows = await db
    .select({
      executionId: executionSteps.executionId,
      workspaceId: executionSteps.workspaceId,
      nodeId: executionSteps.nodeId,
      maxAttempt: sql<number>`max(${executionSteps.attempt})`,
    })
    .from(executionSteps)
    .groupBy(
      executionSteps.executionId,
      executionSteps.workspaceId,
      executionSteps.nodeId
    )
    .having(sql`max(${executionSteps.attempt}) >= ${minAttempt}`)
  return rows
}

export type ExcessResumesResult = {
  executionId: string
  workspaceId: string
  resumeCount: number
}

export async function detectExcessResumes(
  db: DbClient,
  minResumes = 2
): Promise<ExcessResumesResult[]> {
  const rows = await db
    .select({
      executionId: executionSteps.executionId,
      workspaceId: executionSteps.workspaceId,
      // Postgres count(*) is bigint, returned as a string unless cast down.
      resumeCount: sql<number>`count(*)::int`,
    })
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.isSystemEvent, true),
        eq(executionSteps.nodeId, "__resumed__")
      )
    )
    .groupBy(executionSteps.executionId, executionSteps.workspaceId)
    .having(sql`count(*) > ${minResumes}`)
  return rows
}

export type CostJumpResult = {
  executionId: string
  workspaceId: string
  nodeId: string
  costMicros: string
  historicalAvgMicros: string
}

// Excludes the current row from its own baseline, so a big enough spike can't hide by dragging up the average it's compared against.
export async function detectCostJump(
  db: DbClient,
  multiplier = 10,
  minSamples = 3
): Promise<CostJumpResult[]> {
  const result = await db.execute<CostJumpResult>(sql`
    WITH per_step AS (
      SELECT
        ${executionSteps.executionId} AS execution_id,
        ${executionSteps.workspaceId} AS workspace_id,
        ${executionSteps.nodeId} AS node_id,
        ${executionSteps.costMicros} AS cost_micros,
        sum(${executionSteps.costMicros}) OVER (
          PARTITION BY ${executions.workflowId}, ${executionSteps.nodeId}
        ) - ${executionSteps.costMicros} AS others_sum,
        count(*) OVER (
          PARTITION BY ${executions.workflowId}, ${executionSteps.nodeId}
        ) - 1 AS others_count
      FROM ${executionSteps}
      JOIN ${executions} ON ${executions.id} = ${executionSteps.executionId}
      WHERE ${executionSteps.costMicros} > 0
    )
    SELECT
      execution_id AS "executionId",
      workspace_id AS "workspaceId",
      node_id AS "nodeId",
      cost_micros AS "costMicros",
      (others_sum::numeric / others_count) AS "historicalAvgMicros"
    FROM per_step
    WHERE others_count >= ${minSamples}
      AND cost_micros >= (others_sum::numeric / others_count) * ${multiplier}
  `)
  return result.rows
}

/** Workflows with at least one recorded branch step — the only ones worth checking for an unreached condition. */
export async function getWorkflowIdsWithBranchSteps(
  db: DbClient
): Promise<{ workflowId: string; workspaceId: string }[]> {
  const rows = await db
    .selectDistinct({
      workflowId: executions.workflowId,
      workspaceId: executions.workspaceId,
    })
    .from(executionSteps)
    .innerJoin(executions, eq(executions.id, executionSteps.executionId))
    .where(eq(executionSteps.name, "branch"))
  return rows
}

/** The set of `branch` output values ever observed for one node, across every execution of a workflow. */
export async function getObservedBranchValues(
  db: DbClient,
  workflowId: string,
  nodeId: string
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({
      branch: sql<string>`${executionSteps.output}->>'branch'`,
    })
    .from(executionSteps)
    .innerJoin(executions, eq(executions.id, executionSteps.executionId))
    .where(
      and(
        eq(executions.workflowId, workflowId),
        eq(executionSteps.nodeId, nodeId),
        isNotNull(sql`${executionSteps.output}->>'branch'`)
      )
    )
  return new Set(rows.map((r) => r.branch))
}

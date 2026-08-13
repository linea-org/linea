import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm"
import {
  executions,
  executionSteps,
  flags,
  type Flag,
  type NewFlag,
} from "../schema/index.js"
import { recordSignalOccurrence } from "./signal.repository.js"
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
  if (flag) {
    await recordSignalOccurrence(db, flag)
  }
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
    // A resumed execution's synthetic marker also lives on "attempt", counting resumes, not node retries.
    .where(eq(executionSteps.isSystemEvent, false))
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

// Baseline is prior occurrences only, ordered by (startedAt, createdAt) since startedAt can tie at millisecond resolution — not a symmetric window over the whole partition.
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
          ORDER BY ${executionSteps.startedAt}, ${executionSteps.createdAt}
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prior_sum,
        count(*) OVER (
          PARTITION BY ${executions.workflowId}, ${executionSteps.nodeId}
          ORDER BY ${executionSteps.startedAt}, ${executionSteps.createdAt}
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prior_count
      FROM ${executionSteps}
      JOIN ${executions} ON ${executions.id} = ${executionSteps.executionId}
      WHERE ${executionSteps.costMicros} > 0
    )
    SELECT
      execution_id AS "executionId",
      workspace_id AS "workspaceId",
      node_id AS "nodeId",
      cost_micros AS "costMicros",
      (prior_sum::numeric / prior_count) AS "historicalAvgMicros"
    FROM per_step
    WHERE prior_count >= ${minSamples}
      AND cost_micros >= (prior_sum::numeric / prior_count) * ${multiplier}
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

/** The set of `branch` output values observed for one node, scoped to a single workflow version — a node id can be reused across versions with a different set of edges/conditions, so mixing versions could credit a condition as taken by coincidence. */
export async function getObservedBranchValues(
  db: DbClient,
  workflowVersionId: string,
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
        eq(executions.workflowVersionId, workflowVersionId),
        eq(executionSteps.nodeId, nodeId),
        isNotNull(sql`${executionSteps.output}->>'branch'`)
      )
    )
  return new Set(rows.map((r) => r.branch))
}

export type TranscriptFlagResult = {
  stepId: string
  executionId: string
  workspaceId: string
  nodeId: string
}

/** A non-"ai" step that failed — the closest real equivalent to "a tool call failed" until a dedicated tool/MCP node exists. */
export async function detectToolErrors(
  db: DbClient
): Promise<TranscriptFlagResult[]> {
  return db
    .select({
      stepId: executionSteps.id,
      executionId: executionSteps.executionId,
      workspaceId: executionSteps.workspaceId,
      nodeId: executionSteps.nodeId,
    })
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.status, "failed"),
        eq(executionSteps.isSystemEvent, false),
        ne(executionSteps.name, "ai")
      )
    )
}

/** An "ai" step that succeeded but returned no real text. */
export async function detectEmptyResponses(
  db: DbClient
): Promise<TranscriptFlagResult[]> {
  return db
    .select({
      stepId: executionSteps.id,
      executionId: executionSteps.executionId,
      workspaceId: executionSteps.workspaceId,
      nodeId: executionSteps.nodeId,
    })
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.name, "ai"),
        eq(executionSteps.status, "succeeded"),
        sql`trim(coalesce(${executionSteps.output}->>'text', '')) = ''`
      )
    )
}

// Deterministic lead-in phrases, no model call — a first pass, not a classifier, and will over- and under-match.
export const REFUSAL_PATTERNS = [
  "i cannot",
  "i can't",
  "i won't",
  "i will not",
  "i'm unable to",
  "i am unable to",
  "i'm not able to",
  "as an ai",
  "i must decline",
]

/** An "ai" step whose output text matches a refusal lead-in phrase. */
export async function detectRefusals(
  db: DbClient
): Promise<TranscriptFlagResult[]> {
  const pattern = REFUSAL_PATTERNS.join("|")
  return db
    .select({
      stepId: executionSteps.id,
      executionId: executionSteps.executionId,
      workspaceId: executionSteps.workspaceId,
      nodeId: executionSteps.nodeId,
    })
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.name, "ai"),
        eq(executionSteps.status, "succeeded"),
        sql`lower(coalesce(${executionSteps.output}->>'text', '')) ~ ${pattern}`
      )
    )
}

export type RepeatedReplayResult = {
  executionId: string
  workspaceId: string
  originalStepId: string
  replayCount: number
}

/** The same original step replayed several times in a short window — a proxy for a user actively iterating, absent any real chat/conversation concept to detect frustration in directly. */
export async function detectRepeatedReplay(
  db: DbClient,
  minReplays = 3,
  windowMs = 60 * 60 * 1000
): Promise<RepeatedReplayResult[]> {
  const since = new Date(Date.now() - windowMs)
  const rows = await db
    .select({
      executionId: executionSteps.executionId,
      workspaceId: executionSteps.workspaceId,
      originalStepId: executionSteps.replayedFromStepId,
      replayCount: sql<number>`count(*)::int`,
    })
    .from(executionSteps)
    .where(
      and(
        isNotNull(executionSteps.replayedFromStepId),
        gte(executionSteps.createdAt, since)
      )
    )
    .groupBy(
      executionSteps.executionId,
      executionSteps.workspaceId,
      executionSteps.replayedFromStepId
    )
    .having(sql`count(*) >= ${minReplays}`)
  return rows.map((r) => ({ ...r, originalStepId: r.originalStepId as string }))
}

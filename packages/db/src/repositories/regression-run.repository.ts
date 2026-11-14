import { and, desc, eq, inArray } from "drizzle-orm"
import {
  regressionCases,
  regressionResults,
  regressionRuns,
  type RegressionResult,
  type RegressionRun,
  type NewRegressionResult,
  type NewRegressionRun,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createRegressionRun(
  db: DbClient,
  input: Pick<
    NewRegressionRun,
    "workspaceId" | "workflowId" | "workflowVersionId" | "trigger"
  >
): Promise<RegressionRun> {
  const [run] = await db.insert(regressionRuns).values(input).returning()
  return run
}

export async function getRegressionRunById(
  db: DbClient,
  workspaceId: string,
  runId: string
): Promise<RegressionRun | undefined> {
  const [run] = await db
    .select()
    .from(regressionRuns)
    .where(
      and(
        eq(regressionRuns.id, runId),
        eq(regressionRuns.workspaceId, workspaceId)
      )
    )
  return run
}

export type CompleteRegressionRunInput = {
  passed: number
  failed: number
  total: number
  costMicros: bigint
}

export async function completeRegressionRun(
  db: DbClient,
  workspaceId: string,
  runId: string,
  input: CompleteRegressionRunInput
): Promise<RegressionRun | undefined> {
  const [run] = await db
    .update(regressionRuns)
    .set({ ...input, completedAt: new Date() })
    .where(
      and(
        eq(regressionRuns.id, runId),
        eq(regressionRuns.workspaceId, workspaceId)
      )
    )
    .returning()
  return run
}

export async function listRegressionRuns(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  options: { limit?: number } = {}
): Promise<RegressionRun[]> {
  return db
    .select()
    .from(regressionRuns)
    .where(
      and(
        eq(regressionRuns.workspaceId, workspaceId),
        eq(regressionRuns.workflowId, workflowId)
      )
    )
    .orderBy(desc(regressionRuns.startedAt))
    .limit(options.limit ?? 50)
}

export type NewRegressionResultInput = Omit<
  NewRegressionResult,
  "runId" | "workspaceId"
>

/** A result for a case erased while the run was in flight is stored without its output. */
export async function insertRegressionResults(
  db: DbClient,
  runId: string,
  workspaceId: string,
  results: NewRegressionResultInput[]
): Promise<void> {
  if (results.length === 0) return
  await db.transaction(async (tx) => {
    const live = await tx
      .select({ id: regressionCases.id })
      .from(regressionCases)
      .where(
        inArray(
          regressionCases.id,
          results.map(({ caseId }) => caseId)
        )
      )
      .orderBy(regressionCases.id)
      .for("share")
    const liveIds = new Set(live.map(({ id }) => id))
    await tx.insert(regressionResults).values(
      results.map((result) => ({
        ...result,
        runId,
        workspaceId,
        output: liveIds.has(result.caseId) ? result.output : null,
      }))
    )
  })
}

export async function listRegressionResults(
  db: DbClient,
  workspaceId: string,
  runId: string
): Promise<RegressionResult[]> {
  return db
    .select()
    .from(regressionResults)
    .where(
      and(
        eq(regressionResults.runId, runId),
        eq(regressionResults.workspaceId, workspaceId)
      )
    )
}

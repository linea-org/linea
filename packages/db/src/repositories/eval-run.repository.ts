import { and, desc, eq } from "drizzle-orm"
import {
  evalResults,
  evalRuns,
  type EvalResult,
  type EvalRun,
  type NewEvalResult,
  type NewEvalRun,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createEvalRun(
  db: DbClient,
  input: Pick<
    NewEvalRun,
    "workspaceId" | "workflowId" | "workflowVersionId" | "trigger"
  >
): Promise<EvalRun> {
  const [run] = await db.insert(evalRuns).values(input).returning()
  return run
}

export type CompleteEvalRunInput = {
  passed: number
  failed: number
  total: number
  costMicros: bigint
}

export async function completeEvalRun(
  db: DbClient,
  runId: string,
  input: CompleteEvalRunInput
): Promise<EvalRun | undefined> {
  const [run] = await db
    .update(evalRuns)
    .set({ ...input, completedAt: new Date() })
    .where(eq(evalRuns.id, runId))
    .returning()
  return run
}

export async function listEvalRuns(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  options: { limit?: number } = {}
): Promise<EvalRun[]> {
  return db
    .select()
    .from(evalRuns)
    .where(
      and(
        eq(evalRuns.workspaceId, workspaceId),
        eq(evalRuns.workflowId, workflowId)
      )
    )
    .orderBy(desc(evalRuns.startedAt))
    .limit(options.limit ?? 50)
}

export type NewEvalResultInput = Omit<NewEvalResult, "runId" | "workspaceId">

export async function insertEvalResults(
  db: DbClient,
  runId: string,
  workspaceId: string,
  results: NewEvalResultInput[]
): Promise<void> {
  if (results.length === 0) return
  await db
    .insert(evalResults)
    .values(results.map((result) => ({ ...result, runId, workspaceId })))
}

export async function listEvalResults(
  db: DbClient,
  runId: string
): Promise<EvalResult[]> {
  return db.select().from(evalResults).where(eq(evalResults.runId, runId))
}

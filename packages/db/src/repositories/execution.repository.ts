import { and, desc, eq, lt, notInArray, or } from "drizzle-orm"
import {
  executions,
  executionSteps,
  type Execution,
  type ExecutionStep,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type CreateExecutionInput = {
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  trigger: Execution["trigger"]
  triggerPayload?: Record<string, unknown>
  origin?: Execution["origin"]
}

export async function createExecution(
  db: DbClient,
  input: CreateExecutionInput
): Promise<Execution> {
  const [execution] = await db.insert(executions).values(input).returning()
  return execution
}

/**
 * Claims a queued execution, or one left "running" by a worker that died before its
 * lease expired — this is the only reclaim path, so a crashed worker's execution isn't
 * stuck forever. Still a single atomic UPDATE, so two workers racing to claim it (fresh
 * or reclaimed) get a defined outcome.
 */
export async function startExecution(
  db: DbClient,
  executionId: string,
  leasedBy: string,
  leaseExpiresAt: Date
): Promise<Execution | undefined> {
  const [execution] = await db
    .update(executions)
    .set({
      status: "running",
      leasedBy,
      leaseExpiresAt,
      startedAt: new Date(),
    })
    .where(
      and(
        eq(executions.id, executionId),
        or(
          eq(executions.status, "queued"),
          and(
            eq(executions.status, "running"),
            lt(executions.leaseExpiresAt, new Date())
          )
        )
      )
    )
    .returning()
  return execution
}

/**
 * Only renews if `leasedBy` still matches — a worker whose lease was reclaimed by
 * another worker (see `startExecution`) can't extend the reclaiming worker's lease
 * by continuing to heartbeat with its own stale identity.
 */
export async function renewLease(
  db: DbClient,
  executionId: string,
  leasedBy: string,
  leaseExpiresAt: Date
): Promise<Execution | undefined> {
  const [execution] = await db
    .update(executions)
    .set({ leaseExpiresAt })
    .where(
      and(
        eq(executions.id, executionId),
        eq(executions.status, "running"),
        eq(executions.leasedBy, leasedBy)
      )
    )
    .returning()
  return execution
}

export type CompleteExecutionInput = {
  status: "succeeded" | "failed" | "cancelled"
  error?: { message: string; stepId?: string }
  costMicros: bigint
  tokensInput: number
  tokensOutput: number
}

const terminalStatuses: Execution["status"][] = [
  "succeeded",
  "failed",
  "cancelled",
]

/**
 * Only transitions if not already terminal AND `leasedBy` still matches, so neither a
 * delayed/retried completion nor a worker that lost the lease to a reclaim (see
 * `startExecution`) can overwrite the outcome the current owner records.
 */
export async function completeExecution(
  db: DbClient,
  executionId: string,
  leasedBy: string,
  input: CompleteExecutionInput
): Promise<Execution | undefined> {
  const [execution] = await db
    .update(executions)
    .set({ ...input, completedAt: new Date() })
    .where(
      and(
        eq(executions.id, executionId),
        eq(executions.leasedBy, leasedBy),
        notInArray(executions.status, terminalStatuses)
      )
    )
    .returning()
  return execution
}

/** Current `leasedBy`, or undefined if the execution doesn't exist — used to check ownership before a risky operation, not just before persisting its result. */
export async function getLeaseOwner(
  db: DbClient,
  executionId: string
): Promise<string | null | undefined> {
  const [execution] = await db
    .select({ leasedBy: executions.leasedBy })
    .from(executions)
    .where(eq(executions.id, executionId))
  return execution?.leasedBy
}

export async function getExecutionWithSteps(
  db: DbClient,
  executionId: string
): Promise<{ execution: Execution; steps: ExecutionStep[] } | undefined> {
  const [execution] = await db
    .select()
    .from(executions)
    .where(eq(executions.id, executionId))
  if (!execution) return undefined

  const steps = await db
    .select()
    .from(executionSteps)
    .where(eq(executionSteps.executionId, executionId))
    .orderBy(executionSteps.sequence)

  return { execution, steps }
}

export async function listExecutions(
  db: DbClient,
  workflowId: string,
  options: { limit?: number } = {}
): Promise<Execution[]> {
  return db
    .select()
    .from(executions)
    .where(eq(executions.workflowId, workflowId))
    .orderBy(desc(executions.createdAt))
    .limit(options.limit ?? 50)
}

import { and, desc, eq, gt, lt, notInArray, or } from "drizzle-orm"
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

/** Claims a queued execution, or a running one whose lease expired — the only reclaim path, atomic so racing claims get a defined outcome. */
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

/** Only renews if `leasedBy` still matches and the current lease hasn't already expired — a stalled heartbeat can't resurrect a lease nobody reclaimed yet but that's already timed out. */
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
        eq(executions.leasedBy, leasedBy),
        gt(executions.leaseExpiresAt, new Date())
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

/** Only transitions if not already terminal, `leasedBy` still matches, and the lease hasn't expired — a stalled worker can't finalize stale work just because nobody's reclaimed it yet. */
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
        gt(executions.leaseExpiresAt, new Date()),
        notInArray(executions.status, terminalStatuses)
      )
    )
    .returning()
  return execution
}

/**
 * Marks a still-queued execution as failed before any worker ever claimed it — for when
 * enqueueing to the job queue itself fails, so the row doesn't strand at "queued" forever
 * with no job behind it. `completeExecution` can't be used here: it requires a `leasedBy`
 * match, and a never-claimed execution's `leasedBy` is null, which no value equals.
 */
export async function failQueuedExecution(
  db: DbClient,
  executionId: string,
  error: { message: string }
): Promise<Execution | undefined> {
  const [execution] = await db
    .update(executions)
    .set({ status: "failed", error, completedAt: new Date() })
    .where(and(eq(executions.id, executionId), eq(executions.status, "queued")))
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

/** Whether `leasedBy` both matches and its lease hasn't expired — identity alone isn't enough, since a stalled heartbeat can leave a stale identity in place until someone reclaims it. */
export async function isLeaseValid(
  db: DbClient,
  executionId: string,
  leasedBy: string
): Promise<boolean> {
  const [execution] = await db
    .select({
      leasedBy: executions.leasedBy,
      leaseExpiresAt: executions.leaseExpiresAt,
    })
    .from(executions)
    .where(eq(executions.id, executionId))
  return (
    execution?.leasedBy === leasedBy &&
    execution.leaseExpiresAt !== null &&
    execution.leaseExpiresAt > new Date()
  )
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

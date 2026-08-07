import { and, desc, eq, gt, lt, notInArray, or, sql } from "drizzle-orm"
import {
  executions,
  executionSteps,
  workflows,
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

export type TriggerWorkflowLookup =
  | { by: "id"; value: string }
  | { by: "slug"; value: string }

export type TriggerWorkflowResult =
  | { outcome: "created"; execution: Execution }
  | { outcome: "not_found" }
  | { outcome: "archived" }
  | { outcome: "unpublished" }

/**
 * Locks the workflow row for the check's duration, so an archive committed concurrently
 * can't slip an execution past the check-then-insert gap: either this transaction sees
 * the archive and rejects, or it holds the lock first and the archive waits until this
 * commits — at which point the execution it created is already real, which is correct,
 * since that trigger legitimately raced ahead of the archive.
 */
export async function triggerWorkflowExecution(
  db: DbClient,
  workspaceId: string,
  lookup: TriggerWorkflowLookup,
  input: {
    trigger: Execution["trigger"]
    triggerPayload?: Record<string, unknown>
  }
): Promise<TriggerWorkflowResult> {
  return db.transaction(async (tx) => {
    const [workflow] = await tx
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          lookup.by === "id"
            ? eq(workflows.id, lookup.value)
            : eq(workflows.slug, lookup.value)
        )
      )
      .for("update")

    if (!workflow) return { outcome: "not_found" }
    if (workflow.archivedAt) return { outcome: "archived" }
    if (!workflow.publishedVersionId) return { outcome: "unpublished" }

    const [execution] = await tx
      .insert(executions)
      .values({
        workspaceId,
        workflowId: workflow.id,
        workflowVersionId: workflow.publishedVersionId,
        trigger: input.trigger,
        triggerPayload: input.triggerPayload,
      })
      .returning()

    return { outcome: "created", execution }
  })
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

/** Counts an enqueue failure but never fails the execution: a schedule has no caller to retry it, and once next_run_at has advanced, a terminal status would drop the occurrence for good — retrying forever costs nothing at this scale. */
export async function recordEnqueueFailure(
  db: DbClient,
  executionId: string
): Promise<Execution | undefined> {
  const [execution] = await db
    .update(executions)
    .set({ enqueueAttempts: sql`${executions.enqueueAttempts} + 1` })
    .where(and(eq(executions.id, executionId), eq(executions.status, "queued")))
    .returning()
  return execution
}

/** Executions still "queued" past the cutoff — a crash between creating the row and enqueueing its job leaves no other trace, so age is the only signal. */
export async function findStaleQueuedExecutions(
  db: DbClient,
  olderThan: Date
): Promise<Execution[]> {
  return db
    .select()
    .from(executions)
    .where(
      and(eq(executions.status, "queued"), lt(executions.createdAt, olderThan))
    )
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

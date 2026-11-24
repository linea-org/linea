import { randomUUID } from "node:crypto"
import { and, eq, inArray, sql } from "drizzle-orm"
import {
  executions,
  executionSteps,
  type Execution,
  type NewExecutionStep,
} from "../schema/index.js"
import {
  getNextStepSequence,
  mergeCostUnpriced,
  sumStepTotals,
} from "./execution-step.repository.js"
import type { DbClient } from "./types.js"

/** Expects the rows to be locked. Keeps who held the lease, so only that worker can report the call it was in. */
export async function cancelExecutions(
  tx: DbClient,
  executionIds: string[],
  cancelledAt: Date
): Promise<Execution[]> {
  const steps = await tx
    .select()
    .from(executionSteps)
    .where(inArray(executionSteps.executionId, executionIds))
  const cancelled: Execution[] = []
  for (const id of executionIds) {
    const [execution] = await tx
      .update(executions)
      .set({
        status: "cancelled",
        completedAt: cancelledAt,
        leaseExpiresAt: null,
        ...sumStepTotals(steps.filter((step) => step.executionId === id)),
      })
      .where(eq(executions.id, id))
      .returning()
    cancelled.push(execution)
  }
  return cancelled
}

/** Whether the Execution was cancelled while `leasedBy` held it, rather than taken over by another worker. */
export async function wasCancelledFrom(
  db: DbClient,
  executionId: string,
  leasedBy: string
): Promise<boolean> {
  const [execution] = await db
    .select({ id: executions.id })
    .from(executions)
    .where(cancelledFrom(executionId, leasedBy))
  return execution !== undefined
}

/** Adds a model call that outlived its cancelled Execution to the totals; does nothing unless `leasedBy` held it when it was cancelled. */
export function recordCancelledModelCall(
  db: DbClient,
  leasedBy: string,
  call: Pick<
    NewExecutionStep,
    "nodeId" | "startedAt" | "endedAt" | "model" | "provider"
  > & {
    executionId: string
    // Null when the call was aborted, so nothing says what it used and the cost is partial.
    usage: {
      tokensInput: number
      tokensOutput: number
      costMicros: bigint
      costUnpriced: boolean
    } | null
  }
): Promise<void> {
  return db.transaction(async (tx) => {
    const { executionId, usage, ...step } = call
    const [execution] = await tx
      .select()
      .from(executions)
      .where(cancelledFrom(executionId, leasedBy))
      .for("update")
    if (!execution) return
    const { costUnpriced, ...used } = usage ?? {
      costUnpriced: true,
      tokensInput: 0,
      tokensOutput: 0,
      costMicros: 0n,
    }
    await tx.insert(executionSteps).values({
      ...step,
      ...used,
      executionId,
      workspaceId: execution.workspaceId,
      traceId: executionId,
      spanId: randomUUID(),
      name: "ai",
      status: "failed",
      sequence: await getNextStepSequence(tx, executionId),
      error: {
        message: usage
          ? "Cancelled during this model call"
          : "Cancelled during this model call, which reported no usage",
      },
      attributes: { costUnpriced },
    })
    // Added to, not summed again: an erased Execution no longer has its earlier steps.
    await tx
      .update(executions)
      .set({
        tokensInput: sql`${executions.tokensInput} + ${used.tokensInput}`,
        tokensOutput: sql`${executions.tokensOutput} + ${used.tokensOutput}`,
        costMicros: sql`${executions.costMicros} + ${used.costMicros}`,
        costUnpriced: mergeCostUnpriced(execution.costUnpriced, costUnpriced),
      })
      .where(eq(executions.id, executionId))
  })
}

function cancelledFrom(executionId: string, leasedBy: string) {
  return and(
    eq(executions.id, executionId),
    eq(executions.status, "cancelled"),
    eq(executions.leasedBy, leasedBy)
  )
}

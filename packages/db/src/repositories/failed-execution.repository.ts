import { and, eq, inArray, notInArray, sql } from "drizzle-orm"
import {
  actionIntents,
  approvalRequests,
  auditLogs,
  executions,
  executionSteps,
  type Execution,
} from "../schema/index.js"
import {
  cancelNonExecutingActionIntents,
  recordApprovalCancellation,
} from "./action-intent-cancellation.repository.js"
import { lockExecutionTree } from "./approval-request.repository.js"
import {
  completeExecution,
  terminalStatuses,
  type CompleteExecutionInput,
} from "./execution.repository.js"
import { sumStepTotals } from "./execution-step.repository.js"
import type { DbClient, Transaction } from "./types.js"

/** Fails an Execution and cancels what it left open, except an Agent whose claimed Action Intent must still report (ADR 0029). */
export function failExecution(
  db: DbClient,
  executionId: string,
  leasedBy: string,
  input: Omit<CompleteExecutionInput, "status" | "output">
): Promise<Execution | undefined> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(executions)
      .where(eq(executions.id, executionId))
    if (!current) return undefined
    const { workspaceId, environmentId } = current
    const tree = await lockExecutionTree(
      tx,
      workspaceId,
      environmentId,
      executionId
    )
    const ids = tree.map(({ id }) => id)
    // The same row order as a cancel (#359): requests, Executions with the root last, then intents.
    await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(inArray(approvalRequests.executionId, ids))
      .orderBy(approvalRequests.id)
      .for("update")
    await tx
      .select({ id: executions.id })
      .from(executions)
      .where(inArray(executions.id, ids))
      .orderBy(sql`${executions.id} = ${executionId}`, executions.id)
      .for("update")
    const executing = await tx
      .select({ executionId: actionIntents.executionId })
      .from(actionIntents)
      .where(
        and(
          inArray(actionIntents.executionId, ids),
          eq(actionIntents.status, "executing")
        )
      )
      .orderBy(actionIntents.id)
      .for("update")
    const failed = await completeExecution(tx, executionId, leasedBy, {
      ...input,
      status: "failed",
    })
    if (!failed) return undefined
    const reporting = new Set(executing.map((intent) => intent.executionId))
    const open = ids.filter((id) => !reporting.has(id))
    await cancelOpenWork(tx, failed, open, new Date())
    return failed
  })
}

async function cancelOpenWork(
  tx: Transaction,
  failed: Execution,
  executionIds: string[],
  cancelledAt: Date
): Promise<void> {
  if (executionIds.length === 0) return
  const actor = { kind: "system" } as const
  await cancelNonExecutingActionIntents(tx, {
    workspaceId: failed.workspaceId,
    scope: { kind: "execution", ids: executionIds },
    actor,
    cancelledAt,
  })
  const requests = await tx
    .update(approvalRequests)
    .set({
      status: "cancelled",
      cancelledAt,
      version: sql`${approvalRequests.version} + 1`,
    })
    .where(
      and(
        inArray(approvalRequests.executionId, executionIds),
        eq(approvalRequests.status, "pending")
      )
    )
    .returning()
  for (const request of requests) {
    await recordApprovalCancellation(tx, request, actor)
  }
  const agents = await tx
    .select()
    .from(executions)
    .where(
      and(
        inArray(executions.id, executionIds),
        eq(executions.parentExecutionId, failed.id),
        notInArray(executions.status, terminalStatuses)
      )
    )
  if (agents.length === 0) return
  const steps = await tx
    .select()
    .from(executionSteps)
    .where(
      inArray(
        executionSteps.executionId,
        agents.map(({ id }) => id)
      )
    )
  for (const { id } of agents) {
    await tx
      .update(executions)
      .set({
        status: "cancelled",
        completedAt: cancelledAt,
        leasedBy: null,
        leaseExpiresAt: null,
        ...sumStepTotals(steps.filter((step) => step.executionId === id)),
      })
      .where(eq(executions.id, id))
  }
  await tx.insert(auditLogs).values(
    agents.map(({ id, environmentId }) => ({
      workspaceId: failed.workspaceId,
      action: "execution.cancelled" as const,
      resource: "execution" as const,
      resourceId: id,
      metadata: { environmentId, parentExecutionId: failed.id },
    }))
  )
}

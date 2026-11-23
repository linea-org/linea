import { and, eq, inArray } from "drizzle-orm"
import { approvalRequests, executions, waitTimers } from "../schema/index.js"
import { pauseExecution, terminalStatuses } from "./execution.repository.js"
import type { DbClient, Transaction } from "./types.js"

export type WaitingStep = {
  nodeId: string
  kind: "approval" | "agent" | "wait"
}

export type ClaimPauseInput = {
  workspaceId: string
  executionId: string
  leasedBy: string
  steps: WaitingStep[]
}

export type ClaimPauseResult =
  | { outcome: "paused" }
  | { outcome: "already-resolved" }
  // pauseExecution's own guard (leasedBy match, unexpired lease) didn't hold.
  | { outcome: "lease-lost" }

/** Pauses only while every step still waits: whatever resolves one finds the Execution paused, or is found here. */
export function claimPause(
  db: DbClient,
  input: ClaimPauseInput
): Promise<ClaimPauseResult> {
  return db.transaction(async (tx): Promise<ClaimPauseResult> => {
    const waiting = await lockWaitingNodeIds(tx, input)
    if (input.steps.some(({ nodeId }) => !waiting.has(nodeId)))
      return { outcome: "already-resolved" }
    const paused = await pauseExecution(tx, input.executionId, input.leasedBy)
    return { outcome: paused ? "paused" : "lease-lost" }
  })
}

// Requests, then Agents, then the Execution itself: the order a cancel locks them in (#359). Every
// resolver changes one of these rows before the Execution, so none can slip in between.
async function lockWaitingNodeIds(
  tx: Transaction,
  { workspaceId, executionId, steps }: ClaimPauseInput
): Promise<Set<string>> {
  const nodeIds = (kind: WaitingStep["kind"]) =>
    steps.filter((step) => step.kind === kind).map((step) => step.nodeId)
  const waiting = new Set<string>()
  const requests = await tx
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.executionId, executionId),
        inArray(approvalRequests.nodeId, nodeIds("approval"))
      )
    )
    .orderBy(approvalRequests.id)
    .for("update")
  for (const { nodeId, status } of requests) {
    if (status === "pending") waiting.add(nodeId)
  }
  const agents = await tx
    .select()
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, workspaceId),
        eq(executions.parentExecutionId, executionId),
        inArray(executions.parentNodeId, nodeIds("agent"))
      )
    )
    .orderBy(executions.id)
    .for("update")
  for (const { parentNodeId, status } of agents) {
    if (parentNodeId && !terminalStatuses.includes(status))
      waiting.add(parentNodeId)
  }
  const timers = await tx
    .select()
    .from(waitTimers)
    .where(
      and(
        eq(waitTimers.workspaceId, workspaceId),
        eq(waitTimers.executionId, executionId),
        inArray(waitTimers.nodeId, nodeIds("wait"))
      )
    )
    .orderBy(waitTimers.id)
    .for("update")
  for (const { nodeId, fired } of timers) {
    if (!fired) waiting.add(nodeId)
  }
  return waiting
}

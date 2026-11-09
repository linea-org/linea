import { and, eq } from "drizzle-orm"
import { executions, type Execution } from "../schema/index.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"
import type { DbClient } from "./types.js"

/** Re-queues a Workflow Execution paused on this finished child in the child's own transaction, so a finished invocation can never leave its parent paused. */
export async function wakeParentOfFinishedChild(
  tx: DbClient,
  child: Execution
): Promise<void> {
  if (!child.parentExecutionId) return
  const [parent] = await tx
    .update(executions)
    .set({ status: "queued" })
    .where(
      and(
        eq(executions.id, child.parentExecutionId),
        eq(executions.status, "paused")
      )
    )
    .returning()
  if (!parent) return
  await createWorkflowExecutionMessage(tx, {
    workspaceId: parent.workspaceId,
    executionId: parent.id,
  })
}

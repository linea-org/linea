import { and, eq } from "drizzle-orm"
import {
  evaluatorNodeProgress,
  executions,
  type EvaluatorNodeProgressState,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getEvaluatorNodeProgress(
  db: DbClient,
  executionId: string,
  nodeId: string
) {
  const [row] = await db
    .select()
    .from(evaluatorNodeProgress)
    .where(
      and(
        eq(evaluatorNodeProgress.executionId, executionId),
        eq(evaluatorNodeProgress.nodeId, nodeId)
      )
    )
    .limit(1)
  return row
}

export async function saveEvaluatorNodeProgress(
  db: DbClient,
  input: {
    executionId: string
    nodeId: string
    leasedBy: string
    state: EvaluatorNodeProgressState
    tokensInput: number
    tokensOutput: number
  }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [execution] = await tx
      .select({
        leasedBy: executions.leasedBy,
        leaseExpiresAt: executions.leaseExpiresAt,
      })
      .from(executions)
      .where(eq(executions.id, input.executionId))
      .for("update")
    if (
      !execution ||
      execution.leasedBy !== input.leasedBy ||
      execution.leaseExpiresAt === null ||
      execution.leaseExpiresAt <= new Date()
    ) {
      return false
    }
    await tx
      .insert(evaluatorNodeProgress)
      .values({
        executionId: input.executionId,
        nodeId: input.nodeId,
        state: input.state,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
      })
      .onConflictDoUpdate({
        target: [
          evaluatorNodeProgress.executionId,
          evaluatorNodeProgress.nodeId,
        ],
        set: {
          state: input.state,
          tokensInput: input.tokensInput,
          tokensOutput: input.tokensOutput,
          updatedAt: new Date(),
        },
      })
    return true
  })
}

import { and, eq } from "drizzle-orm"
import { aiNodeProgress, executions } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getAiNodeProgress(
  db: DbClient,
  executionId: string,
  nodeId: string
) {
  const [row] = await db
    .select()
    .from(aiNodeProgress)
    .where(
      and(
        eq(aiNodeProgress.executionId, executionId),
        eq(aiNodeProgress.nodeId, nodeId)
      )
    )
    .limit(1)
  return row
}

/** Same fencing shape as writeStepAndCheckpoint: locks the execution row and checks the lease before writing, so neither the first insert nor a later overwrite can land under a lease that's moved on. */
export async function saveAiNodeProgress(
  db: DbClient,
  input: {
    executionId: string
    nodeId: string
    leasedBy: string
    conversation: unknown[]
    iteration: number
    tokensInput: number
    tokensOutput: number
  }
): Promise<void> {
  await db.transaction(async (tx) => {
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
      return
    }

    await tx
      .insert(aiNodeProgress)
      .values({
        executionId: input.executionId,
        nodeId: input.nodeId,
        conversation: input.conversation,
        iteration: input.iteration,
        tokensInput: input.tokensInput,
        tokensOutput: input.tokensOutput,
      })
      .onConflictDoUpdate({
        target: [aiNodeProgress.executionId, aiNodeProgress.nodeId],
        set: {
          conversation: input.conversation,
          iteration: input.iteration,
          tokensInput: input.tokensInput,
          tokensOutput: input.tokensOutput,
          updatedAt: new Date(),
        },
      })
  })
}

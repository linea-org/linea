import { and, eq, sql } from "drizzle-orm"
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

export async function saveAiNodeProgress(
  db: DbClient,
  input: {
    executionId: string
    nodeId: string
    // Required so the conflict branch below can be fenced: an overwrite only applies if this
    // caller still holds the execution's lease at commit time, not just when it started the call.
    leasedBy: string
    conversation: unknown[]
    iteration: number
    tokensInput: number
    tokensOutput: number
  }
): Promise<void> {
  await db
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
      setWhere: sql`exists (
        select 1 from ${executions}
        where ${executions.id} = ${aiNodeProgress.executionId}
          and ${executions.leasedBy} = ${input.leasedBy}
          and ${executions.leaseExpiresAt} > now()
      )`,
    })
}

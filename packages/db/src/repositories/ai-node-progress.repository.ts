import { and, eq } from "drizzle-orm"
import { aiNodeProgress } from "../schema/index.js"
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
    conversation: unknown[]
    iteration: number
    tokensInput: number
    tokensOutput: number
  }
): Promise<void> {
  await db
    .insert(aiNodeProgress)
    .values(input)
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
}

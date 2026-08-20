import { and, eq } from "drizzle-orm"
import {
  executions,
  toolCallRecords,
  type NewToolCallRecord,
  type ToolCallRecord,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getToolCallRecord(
  db: DbClient,
  executionId: string,
  nodeId: string,
  contentHash: string,
  occurrence: number
): Promise<ToolCallRecord | undefined> {
  const [record] = await db
    .select()
    .from(toolCallRecords)
    .where(
      and(
        eq(toolCallRecords.executionId, executionId),
        eq(toolCallRecords.nodeId, nodeId),
        eq(toolCallRecords.contentHash, contentHash),
        eq(toolCallRecords.occurrence, occurrence)
      )
    )
    .limit(1)
  return record
}

/** Lease-checked before writing (same shape as saveAiNodeProgress) so a stale worker's response can't win first-write-wins over a valid one — its insert is dropped instead of racing for the row. Once a valid write lands, a second valid racer's insert is still a safe no-op via the unique index. */
export async function recordToolCall(
  db: DbClient,
  input: Omit<NewToolCallRecord, "id" | "createdAt"> & { leasedBy: string }
): Promise<void> {
  const { leasedBy, ...record } = input
  await db.transaction(async (tx) => {
    const [execution] = await tx
      .select({
        leasedBy: executions.leasedBy,
        leaseExpiresAt: executions.leaseExpiresAt,
      })
      .from(executions)
      .where(eq(executions.id, record.executionId))
      .for("update")

    if (
      !execution ||
      execution.leasedBy !== leasedBy ||
      execution.leaseExpiresAt === null ||
      execution.leaseExpiresAt <= new Date()
    ) {
      return
    }

    await tx.insert(toolCallRecords).values(record).onConflictDoNothing()
  })
}

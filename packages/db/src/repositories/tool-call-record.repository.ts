import { and, eq } from "drizzle-orm"
import {
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

/** A racing duplicate (e.g. two overlapping reclaims) is safe — the unique index makes the second insert a no-op instead of a duplicate row. */
export async function recordToolCall(
  db: DbClient,
  input: Omit<NewToolCallRecord, "id" | "createdAt">
): Promise<void> {
  await db.insert(toolCallRecords).values(input).onConflictDoNothing()
}

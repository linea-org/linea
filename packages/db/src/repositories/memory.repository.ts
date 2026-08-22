import { and, desc, eq, gt, isNull, or } from "drizzle-orm"
import { memories, type NewMemory } from "../schema/index.js"
import type { DbClient } from "./types.js"

export type MemoryScope = {
  workspaceId: string
  externalSubjectId: string
  namespace: string
}

export type WriteMemoryInput = MemoryScope & {
  key: string
  value: NewMemory["value"]
  expiresAt?: Date
}

// Upsert — a write replaces whatever was at that key in this scope, not an append log.
export async function writeMemory(
  db: DbClient,
  input: WriteMemoryInput
): Promise<void> {
  await db
    .insert(memories)
    .values({
      workspaceId: input.workspaceId,
      externalSubjectId: input.externalSubjectId,
      namespace: input.namespace,
      key: input.key,
      value: input.value,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        memories.workspaceId,
        memories.externalSubjectId,
        memories.namespace,
        memories.key,
      ],
      set: {
        value: input.value,
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date(),
      },
    })
}

export type ReadMemoryInput = MemoryScope & { key: string }

// A row past its expiresAt reads back as not-found — filtered at query time, no separate sweep.
export async function readMemory(
  db: DbClient,
  input: ReadMemoryInput,
  now: Date = new Date()
) {
  const [row] = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.workspaceId, input.workspaceId),
        eq(memories.externalSubjectId, input.externalSubjectId),
        eq(memories.namespace, input.namespace),
        eq(memories.key, input.key),
        or(isNull(memories.expiresAt), gt(memories.expiresAt, now))
      )
    )
  return row
}

export type ListMemoriesInput = MemoryScope & { limit: number }

// Most-recently-updated first, capped at the caller's limit — recency is the only ordering signal
// available without semantic search, and matches production practice (Mem0, OpenAI's own agent
// context guidance) for automatic recall: a small, recent set beats dumping everything stored.
export async function listMemories(
  db: DbClient,
  input: ListMemoriesInput,
  now: Date = new Date()
) {
  return db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.workspaceId, input.workspaceId),
        eq(memories.externalSubjectId, input.externalSubjectId),
        eq(memories.namespace, input.namespace),
        or(isNull(memories.expiresAt), gt(memories.expiresAt, now))
      )
    )
    .orderBy(desc(memories.updatedAt))
    .limit(input.limit)
}

import { and, count, desc, eq, gt, isNull, or, type SQL } from "drizzle-orm"
import { memories, type NewMemory } from "../schema/index.js"
import type { DbClient } from "./types.js"

export const MAX_MEMORY_VALUE_BYTES = 16_384
export const MAX_MEMORIES_PER_SCOPE = 500
export const DEFAULT_MEMORY_TTL_MS = 90 * 24 * 60 * 60 * 1000

export class MemoryLimitError extends Error {}

export type MemoryScope = {
  workspaceId: string
  environmentId: string
  /** Verified End User record; when present it is the subject and externalSubjectId is ignored. */
  externalSubjectRecordId?: string
  externalSubjectId: string
  namespace: string
}

function scopeCondition(scope: MemoryScope): SQL | undefined {
  return and(
    eq(memories.workspaceId, scope.workspaceId),
    eq(memories.environmentId, scope.environmentId),
    scope.externalSubjectRecordId
      ? eq(memories.externalSubjectRecordId, scope.externalSubjectRecordId)
      : isNull(memories.externalSubjectRecordId),
    eq(
      memories.externalSubjectId,
      scope.externalSubjectRecordId ?? scope.externalSubjectId
    ),
    eq(memories.namespace, scope.namespace)
  )
}

function liveAt(now: Date): SQL | undefined {
  return or(isNull(memories.expiresAt), gt(memories.expiresAt, now))
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
  const bytes = Buffer.byteLength(JSON.stringify(input.value) ?? "null")
  if (bytes > MAX_MEMORY_VALUE_BYTES)
    throw new MemoryLimitError(
      `Memory value is ${bytes} bytes; the limit is ${MAX_MEMORY_VALUE_BYTES}`
    )
  const expiresAt =
    input.expiresAt ?? new Date(Date.now() + DEFAULT_MEMORY_TTL_MS)
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: memories.id })
      .from(memories)
      .where(and(scopeCondition(input), eq(memories.key, input.key)))
    if (!existing) {
      const [stored] = await tx
        .select({ total: count() })
        .from(memories)
        .where(and(scopeCondition(input), liveAt(new Date())))
      if ((stored?.total ?? 0) >= MAX_MEMORIES_PER_SCOPE)
        throw new MemoryLimitError(
          `Memory scope already holds ${MAX_MEMORIES_PER_SCOPE} keys`
        )
    }
    await tx
      .insert(memories)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        externalSubjectRecordId: input.externalSubjectRecordId ?? null,
        externalSubjectId:
          input.externalSubjectRecordId ?? input.externalSubjectId,
        namespace: input.namespace,
        key: input.key,
        value: input.value,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          memories.workspaceId,
          memories.environmentId,
          memories.externalSubjectRecordId,
          memories.externalSubjectId,
          memories.namespace,
          memories.key,
        ],
        set: {
          value: input.value,
          expiresAt,
          updatedAt: new Date(),
        },
      })
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
    .where(and(scopeCondition(input), eq(memories.key, input.key), liveAt(now)))
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
  return (
    db
      .select()
      .from(memories)
      .where(and(scopeCondition(input), liveAt(now)))
      // id as a tie-breaker: updatedAt alone isn't unique, so without it the cutoff row when more
      // matches than the limit share a timestamp would be picked nondeterministically per query.
      .orderBy(desc(memories.updatedAt), desc(memories.id))
      .limit(input.limit)
  )
}

/** Removes a subject's memory: rows keyed to its record, and operator rows keyed to its issuer subject string. */
export async function deleteMemoriesForSubject(
  db: DbClient,
  input: {
    workspaceId: string
    externalSubjectRecordId: string
    issuerSubject: string | null
  }
): Promise<void> {
  await db
    .delete(memories)
    .where(
      and(
        eq(memories.workspaceId, input.workspaceId),
        input.issuerSubject
          ? or(
              eq(
                memories.externalSubjectRecordId,
                input.externalSubjectRecordId
              ),
              and(
                isNull(memories.externalSubjectRecordId),
                eq(memories.externalSubjectId, input.issuerSubject)
              )
            )
          : eq(memories.externalSubjectRecordId, input.externalSubjectRecordId)
      )
    )
}

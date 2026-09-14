import { createHash } from "node:crypto"
import type { JsonValue } from "@linea/protocol/shared"
import { and, eq, isNull } from "drizzle-orm"
import { publicIdempotencyRecords } from "../schema/index.js"
import type { DbClient } from "./types.js"

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`
}

export function hashPublicRequest(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

export type ReservePublicRequestResult =
  | { outcome: "reserved"; recordId: string }
  | { outcome: "replay"; resourceId: string }
  | { outcome: "conflict" }

export async function reservePublicRequest(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    actorKind: "application_key" | "end_user_session"
    actorId: string
    operation: string
    idempotencyKey: string
    requestHash: string
  }
): Promise<ReservePublicRequestResult> {
  const [created] = await db
    .insert(publicIdempotencyRecords)
    .values(input)
    .onConflictDoNothing()
    .returning({ id: publicIdempotencyRecords.id })
  if (created) return { outcome: "reserved", recordId: created.id }
  const [existing] = await db
    .select({
      requestHash: publicIdempotencyRecords.requestHash,
      resourceId: publicIdempotencyRecords.resourceId,
    })
    .from(publicIdempotencyRecords)
    .where(
      and(
        eq(publicIdempotencyRecords.actorKind, input.actorKind),
        eq(publicIdempotencyRecords.actorId, input.actorId),
        eq(publicIdempotencyRecords.operation, input.operation),
        eq(publicIdempotencyRecords.idempotencyKey, input.idempotencyKey)
      )
    )
  if (!existing) throw new Error("Idempotency record disappeared")
  if (existing.requestHash !== input.requestHash) return { outcome: "conflict" }
  if (!existing.resourceId)
    throw new Error("Idempotency result was not finalized")
  return { outcome: "replay", resourceId: existing.resourceId }
}

export async function finalizePublicRequest(
  db: DbClient,
  recordId: string,
  resourceId: string
): Promise<void> {
  const [updated] = await db
    .update(publicIdempotencyRecords)
    .set({ resourceId })
    .where(
      and(
        eq(publicIdempotencyRecords.id, recordId),
        isNull(publicIdempotencyRecords.resourceId)
      )
    )
    .returning({ id: publicIdempotencyRecords.id })
  if (!updated) throw new Error("Idempotency result was already finalized")
}

export async function releasePublicRequest(
  db: DbClient,
  recordId: string
): Promise<void> {
  await db
    .delete(publicIdempotencyRecords)
    .where(
      and(
        eq(publicIdempotencyRecords.id, recordId),
        isNull(publicIdempotencyRecords.resourceId)
      )
    )
}

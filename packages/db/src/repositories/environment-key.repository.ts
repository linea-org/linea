import { createHash } from "node:crypto"
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"
import {
  environments,
  environmentKeys,
  auditLogs,
  type EnvironmentKey,
  type NewAuditLog,
} from "../schema/index.js"
import { consumeRateLimits } from "./end-user-authorization.repository.js"
import type { DbClient, Transaction } from "./types.js"

const LAST_USED_RESOLUTION_MS = 60 * 1000
const ACTIVITY_AUDIT_WINDOW_MS = 60 * 60 * 1000
const ACTIVITY_AUDITS_PER_WINDOW = 20
const ACTIVITY_RETENTION_BATCH = 5000
const activityActions = [
  "environment_key.used",
  "environment_key.scope_denied",
  "environment_key.cross_environment_access_denied",
] as const

export type EnvironmentKeyActor = { userId: string }

export type CreateEnvironmentKeyInput = {
  workspaceId: string
  environmentId: string
  name: string
  scopes: EnvironmentKey["scopes"]
  hashedKey: string
  keyPrefix: string
}

export type CreateEnvironmentKeyResult =
  | { outcome: "created"; environmentKey: EnvironmentKey }
  | { outcome: "environment_not_found" }
  | { outcome: "environment_disabled" }

type EnvironmentKeyActivityAction = Extract<
  NewAuditLog["action"],
  (typeof activityActions)[number]
>

type EnvironmentKeyIdentity = Pick<
  EnvironmentKey,
  "id" | "workspaceId" | "environmentId"
>

async function recordUserAudit(
  tx: Transaction,
  environmentKey: EnvironmentKey,
  actor: EnvironmentKeyActor,
  action: Extract<
    NewAuditLog["action"],
    | "environment_key.created"
    | "environment_key.rotated"
    | "environment_key.revoked"
  >,
  metadata: Record<string, unknown>
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: environmentKey.workspaceId,
    actorUserId: actor.userId,
    action,
    resource: "environment_key",
    resourceId: environmentKey.id,
    metadata,
  })
}

export async function createEnvironmentKey(
  db: DbClient,
  input: CreateEnvironmentKeyInput,
  actor: EnvironmentKeyActor
): Promise<CreateEnvironmentKeyResult> {
  return db.transaction(async (tx): Promise<CreateEnvironmentKeyResult> => {
    const [environment] = await tx
      .select({ id: environments.id, enabled: environments.enabled })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, input.workspaceId),
          eq(environments.id, input.environmentId)
        )
      )
      .for("share")
    if (!environment) return { outcome: "environment_not_found" }
    if (!environment.enabled) return { outcome: "environment_disabled" }
    const [environmentKey] = await tx
      .insert(environmentKeys)
      .values(input)
      .returning()
    await recordUserAudit(
      tx,
      environmentKey,
      actor,
      "environment_key.created",
      {
        environmentId: environmentKey.environmentId,
        scopes: environmentKey.scopes,
      }
    )
    return { outcome: "created", environmentKey }
  })
}

export async function listEnvironmentKeys(
  db: DbClient,
  workspaceId: string,
  environmentId: string
): Promise<EnvironmentKey[]> {
  return db
    .select()
    .from(environmentKeys)
    .where(
      and(
        eq(environmentKeys.workspaceId, workspaceId),
        eq(environmentKeys.environmentId, environmentId)
      )
    )
    .orderBy(desc(environmentKeys.createdAt))
}

export async function revokeEnvironmentKey(
  db: DbClient,
  workspaceId: string,
  environmentId: string,
  id: string,
  actor: EnvironmentKeyActor
): Promise<EnvironmentKey | undefined> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select({ enabled: environments.enabled })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, environmentId)
        )
      )
      .for("share")
    if (!environment) return undefined
    const [existing] = await tx
      .select()
      .from(environmentKeys)
      .where(
        and(
          eq(environmentKeys.workspaceId, workspaceId),
          eq(environmentKeys.environmentId, environmentId),
          eq(environmentKeys.id, id)
        )
      )
      .for("update")
    if (!existing || existing.revokedAt) return existing
    const [environmentKey] = await tx
      .update(environmentKeys)
      .set({ revokedAt: new Date() })
      .where(eq(environmentKeys.id, existing.id))
      .returning()
    await recordUserAudit(
      tx,
      environmentKey,
      actor,
      "environment_key.revoked",
      {
        environmentId: environmentKey.environmentId,
      }
    )
    return environmentKey
  })
}

export async function rotateEnvironmentKey(
  db: DbClient,
  workspaceId: string,
  environmentId: string,
  id: string,
  replacement: { hashedKey: string; keyPrefix: string },
  actor: EnvironmentKeyActor
): Promise<EnvironmentKey | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(environmentKeys)
      .where(
        and(
          eq(environmentKeys.workspaceId, workspaceId),
          eq(environmentKeys.environmentId, environmentId),
          eq(environmentKeys.id, id),
          isNull(environmentKeys.revokedAt)
        )
      )
      .for("update")
    if (!existing) return undefined
    const [environmentKey] = await tx
      .insert(environmentKeys)
      .values({
        workspaceId,
        environmentId,
        name: existing.name,
        scopes: existing.scopes,
        ...replacement,
      })
      .returning()
    await tx
      .update(environmentKeys)
      .set({ revokedAt: new Date() })
      .where(eq(environmentKeys.id, existing.id))
    await recordUserAudit(tx, existing, actor, "environment_key.rotated", {
      environmentId,
      replacementKeyId: environmentKey.id,
    })
    return environmentKey
  })
}

export async function authenticateEnvironmentKey(
  db: DbClient,
  hashedKey: string
): Promise<EnvironmentKey | undefined> {
  const [result] = await db
    .select({ environmentKey: environmentKeys })
    .from(environmentKeys)
    .innerJoin(
      environments,
      and(
        eq(environments.id, environmentKeys.environmentId),
        eq(environments.workspaceId, environmentKeys.workspaceId)
      )
    )
    .where(
      and(
        eq(environmentKeys.hashedKey, hashedKey),
        isNull(environmentKeys.revokedAt),
        eq(environments.enabled, true)
      )
    )
  return result?.environmentKey
}

/** Writes at most one audit row per key, action and metadata each hour and at most 20 per key and action, so repeated use or denial cannot grow `audit_logs` per request; `last_used_at` moves at most once a minute. */
export async function recordEnvironmentKeyActivity(
  db: DbClient,
  environmentKey: EnvironmentKeyIdentity,
  action: EnvironmentKeyActivityAction,
  metadata: Record<string, unknown>,
  now: Date
): Promise<void> {
  await db.transaction(async (tx) => {
    const touched = await tx
      .update(environmentKeys)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(environmentKeys.id, environmentKey.id),
          or(
            isNull(environmentKeys.lastUsedAt),
            lt(
              environmentKeys.lastUsedAt,
              new Date(now.getTime() - LAST_USED_RESOLUTION_MS)
            )
          )
        )
      )
      .returning({ id: environmentKeys.id })
    if (action === "environment_key.used" && touched.length === 0) return
    const window = Math.floor(now.getTime() / ACTIVITY_AUDIT_WINDOW_MS)
    const scope = `environment-key-audit:${environmentKey.id}:${action}:${window}`
    const exhausted = await consumeRateLimits(
      tx,
      [
        { key: scope, limit: ACTIVITY_AUDITS_PER_WINDOW },
        { key: `${scope}:${digest(JSON.stringify(metadata))}`, limit: 1 },
      ],
      new Date((window + 1) * ACTIVITY_AUDIT_WINDOW_MS)
    )
    if (exhausted.length > 0) return
    await tx.insert(auditLogs).values({
      workspaceId: environmentKey.workspaceId,
      actorEnvironmentKeyId: environmentKey.id,
      action,
      resource: "environment_key",
      resourceId: environmentKey.id,
      metadata,
    })
  })
}

/** Deletes one bounded batch of Environment-key use and denial audit rows created before the cutoff; key lifecycle audit rows are kept. */
export async function deleteEnvironmentKeyActivityBefore(
  db: DbClient,
  before: Date
): Promise<number> {
  const expired = db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        inArray(auditLogs.action, [...activityActions]),
        lt(auditLogs.createdAt, before)
      )
    )
    .limit(ACTIVITY_RETENTION_BATCH)
  const deleted = await db
    .delete(auditLogs)
    .where(inArray(auditLogs.id, expired))
    .returning({ id: auditLogs.id })
  return deleted.length
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

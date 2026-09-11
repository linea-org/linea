import { and, desc, eq, isNull } from "drizzle-orm"
import {
  applications,
  applicationKeys,
  auditLogs,
  type ApplicationKey,
  type NewAuditLog,
} from "../schema/index.js"
import type { DbClient, Transaction } from "./types.js"

export type ApplicationKeyActor = { userId: string }

export type CreateApplicationKeyInput = {
  workspaceId: string
  applicationId: string
  name: string
  scopes: ApplicationKey["scopes"]
  hashedKey: string
  keyPrefix: string
}

export type CreateApplicationKeyResult =
  | { outcome: "created"; applicationKey: ApplicationKey }
  | { outcome: "application_not_found" }

type ApplicationKeyActivityAction = Extract<
  NewAuditLog["action"],
  | "application_key.used"
  | "application_key.scope_denied"
  | "application_key.cross_application_access_denied"
>

type ApplicationKeyIdentity = Pick<
  ApplicationKey,
  "id" | "workspaceId" | "applicationId"
>

async function recordUserAudit(
  tx: Transaction,
  applicationKey: ApplicationKey,
  actor: ApplicationKeyActor,
  action: Extract<
    NewAuditLog["action"],
    | "application_key.created"
    | "application_key.rotated"
    | "application_key.revoked"
  >,
  metadata: Record<string, unknown>
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: applicationKey.workspaceId,
    actorUserId: actor.userId,
    action,
    resource: "application_key",
    resourceId: applicationKey.id,
    metadata,
  })
}

export async function createApplicationKey(
  db: DbClient,
  input: CreateApplicationKeyInput,
  actor: ApplicationKeyActor
): Promise<CreateApplicationKeyResult> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, input.applicationId)
        )
      )
      .for("share")
    if (!application) return { outcome: "application_not_found" }
    const [applicationKey] = await tx
      .insert(applicationKeys)
      .values(input)
      .returning()
    await recordUserAudit(
      tx,
      applicationKey,
      actor,
      "application_key.created",
      {
        applicationId: applicationKey.applicationId,
        scopes: applicationKey.scopes,
      }
    )
    return { outcome: "created", applicationKey }
  })
}

export async function listApplicationKeys(
  db: DbClient,
  workspaceId: string,
  applicationId: string
): Promise<ApplicationKey[]> {
  return db
    .select()
    .from(applicationKeys)
    .where(
      and(
        eq(applicationKeys.workspaceId, workspaceId),
        eq(applicationKeys.applicationId, applicationId)
      )
    )
    .orderBy(desc(applicationKeys.createdAt))
}

export async function revokeApplicationKey(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  id: string,
  actor: ApplicationKeyActor
): Promise<ApplicationKey | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(applicationKeys)
      .where(
        and(
          eq(applicationKeys.workspaceId, workspaceId),
          eq(applicationKeys.applicationId, applicationId),
          eq(applicationKeys.id, id)
        )
      )
      .for("update")
    if (!existing || existing.revokedAt) return existing
    const [applicationKey] = await tx
      .update(applicationKeys)
      .set({ revokedAt: new Date() })
      .where(eq(applicationKeys.id, existing.id))
      .returning()
    await recordUserAudit(
      tx,
      applicationKey,
      actor,
      "application_key.revoked",
      {
        applicationId: applicationKey.applicationId,
      }
    )
    return applicationKey
  })
}

export async function rotateApplicationKey(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  id: string,
  replacement: { hashedKey: string; keyPrefix: string },
  actor: ApplicationKeyActor
): Promise<ApplicationKey | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(applicationKeys)
      .where(
        and(
          eq(applicationKeys.workspaceId, workspaceId),
          eq(applicationKeys.applicationId, applicationId),
          eq(applicationKeys.id, id),
          isNull(applicationKeys.revokedAt)
        )
      )
      .for("update")
    if (!existing) return undefined
    const [applicationKey] = await tx
      .insert(applicationKeys)
      .values({
        workspaceId,
        applicationId,
        name: existing.name,
        scopes: existing.scopes,
        ...replacement,
      })
      .returning()
    await tx
      .update(applicationKeys)
      .set({ revokedAt: new Date() })
      .where(eq(applicationKeys.id, existing.id))
    await recordUserAudit(tx, existing, actor, "application_key.rotated", {
      applicationId,
      replacementKeyId: applicationKey.id,
    })
    return applicationKey
  })
}

export async function authenticateApplicationKey(
  db: DbClient,
  hashedKey: string
): Promise<ApplicationKey | undefined> {
  const [result] = await db
    .select({ applicationKey: applicationKeys })
    .from(applicationKeys)
    .innerJoin(
      applications,
      and(
        eq(applications.id, applicationKeys.applicationId),
        eq(applications.workspaceId, applicationKeys.workspaceId)
      )
    )
    .where(
      and(
        eq(applicationKeys.hashedKey, hashedKey),
        isNull(applicationKeys.revokedAt),
        eq(applications.enabled, true)
      )
    )
  return result?.applicationKey
}

export async function recordApplicationKeyActivity(
  db: DbClient,
  applicationKey: ApplicationKeyIdentity,
  action: ApplicationKeyActivityAction,
  metadata: Record<string, unknown>
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(applicationKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(applicationKeys.id, applicationKey.id))
    await tx.insert(auditLogs).values({
      workspaceId: applicationKey.workspaceId,
      actorApplicationKeyId: applicationKey.id,
      action,
      resource: "application_key",
      resourceId: applicationKey.id,
      metadata,
    })
  })
}

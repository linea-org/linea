import { and, desc, eq, isNull, sql } from "drizzle-orm"
import {
  applications,
  auditLogs,
  endUserAuthorizationRequests,
  endUserIdentityExchanges,
  endUserSessions,
  type Application,
  type ConnectorAccessPolicy,
  type NewAuditLog,
} from "../schema/index.js"
import type { DbClient, Transaction } from "./types.js"

export type ApplicationActor = {
  userId: string
}

export type CreateApplicationInput = {
  workspaceId: string
  environment: Application["environment"]
  displayName: string
  logoUrl: string | null
  allowedBrowserOrigins: string[]
  allowedRedirectOrigins: string[]
  contentRetentionDays: number
  oidcIssuer: string
  oidcClientId: string
  oidcAudience: string
  oidcJwksUrl: string
  oidcSubjectClaim: string
}

export type UpdateApplicationProfileInput = {
  displayName?: string
  logoUrl?: string | null
  contentRetentionDays?: number
}

export type ApplicationTrustConfiguration = {
  allowedBrowserOrigins: string[]
  allowedRedirectOrigins: string[]
  oidcIssuer: string
  oidcClientId: string
  oidcAudience: string
  oidcJwksUrl: string
  oidcSubjectClaim: string
}

type ApplicationAuditAction = Extract<
  NewAuditLog["action"],
  | "application.created"
  | "application.updated"
  | "application.trust_configuration_updated"
  | "application.disabled"
>

async function recordAudit(
  tx: Transaction,
  application: Application,
  actor: ApplicationActor,
  action: ApplicationAuditAction,
  metadata: Record<string, unknown> | null
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: application.workspaceId,
    actorUserId: actor.userId,
    action,
    resource: "application",
    resourceId: application.id,
    metadata,
  })
}

export async function createApplication(
  db: DbClient,
  input: CreateApplicationInput,
  actor: ApplicationActor
): Promise<Application> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .insert(applications)
      .values(input)
      .returning()
    await recordAudit(tx, application, actor, "application.created", {
      environment: application.environment,
    })
    return application
  })
}

export async function getApplicationById(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<Application | undefined> {
  const [application] = await db
    .select()
    .from(applications)
    .where(
      and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
    )
  return application
}

export async function listApplications(
  db: DbClient,
  workspaceId: string
): Promise<Application[]> {
  return db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.kind, "operator")
      )
    )
    .orderBy(desc(applications.createdAt))
}

export async function updateApplicationProfile(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: UpdateApplicationProfileInput,
  actor: ApplicationActor
): Promise<Application | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [application] = await tx
      .update(applications)
      .set({ ...input, updatedAt: now })
      .where(
        and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
      )
      .returning()
    if (!application) return undefined
    await recordAudit(tx, application, actor, "application.updated", {
      changedFields: Object.keys(input).sort(),
    })
    return application
  })
}

export async function replaceApplicationTrustConfiguration(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: ApplicationTrustConfiguration,
  actor: ApplicationActor
): Promise<Application | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [application] = await tx
      .update(applications)
      .set({ ...input, updatedAt: now })
      .where(
        and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
      )
      .returning()
    if (!application) return undefined
    await tx
      .update(endUserSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(endUserSessions.applicationId, application.id),
          isNull(endUserSessions.revokedAt)
        )
      )
    await tx
      .delete(endUserIdentityExchanges)
      .where(eq(endUserIdentityExchanges.applicationId, application.id))
    await tx
      .delete(endUserAuthorizationRequests)
      .where(eq(endUserAuthorizationRequests.applicationId, application.id))
    await recordAudit(
      tx,
      application,
      actor,
      "application.trust_configuration_updated",
      {
        changedFields: [
          "allowedBrowserOrigins",
          "allowedRedirectOrigins",
          "oidcAudience",
          "oidcClientId",
          "oidcIssuer",
          "oidcJwksUrl",
          "oidcSubjectClaim",
        ],
      }
    )
    return application
  })
}

export async function disableApplication(
  db: DbClient,
  workspaceId: string,
  id: string,
  actor: ApplicationActor
): Promise<Application | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(applications)
      .where(
        and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
      )
      .for("update")
    if (!existing || !existing.enabled) return existing
    const now = new Date()
    const [application] = await tx
      .update(applications)
      .set({ enabled: false, updatedAt: now })
      .where(eq(applications.id, existing.id))
      .returning()
    await tx
      .update(endUserSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(endUserSessions.applicationId, application.id),
          isNull(endUserSessions.revokedAt)
        )
      )
    await recordAudit(tx, application, actor, "application.disabled", null)
    return application
  })
}

export async function replaceConnectorAccessPolicy(
  db: DbClient,
  workspaceId: string,
  id: string,
  connectorAccessPolicy: ConnectorAccessPolicy,
  actor: ApplicationActor
): Promise<Application | undefined> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .update(applications)
      .set({ connectorAccessPolicy, updatedAt: new Date() })
      .where(
        and(eq(applications.workspaceId, workspaceId), eq(applications.id, id))
      )
      .returning()
    if (!application) return undefined
    await recordAudit(tx, application, actor, "application.updated", {
      changedFields: ["connectorAccessPolicy"],
    })
    return application
  })
}

export async function isApplicationBrowserOriginAllowed(
  db: DbClient,
  workspaceId: string,
  id: string,
  origin: string
): Promise<boolean> {
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.id, id),
        eq(applications.enabled, true),
        sql`${origin} = ANY(${applications.allowedBrowserOrigins})`
      )
    )
  return Boolean(application)
}

import { and, desc, eq, isNull, sql } from "drizzle-orm"
import {
  environments,
  workflows,
  auditLogs,
  endUserAuthorizationRequests,
  endUserIdentityExchanges,
  endUserSessions,
  type Environment,
  type ConnectorAccessPolicy,
  type NewAuditLog,
} from "../schema/index.js"
import type { DbClient, Transaction } from "./types.js"

export type EnvironmentActor = {
  userId: string
}

export type CreateEnvironmentInput = {
  workspaceId: string
  applicationId: string
  environment: Environment["environment"]
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

export type UpdateEnvironmentProfileInput = {
  displayName?: string
  logoUrl?: string | null
  contentRetentionDays?: number
}

export type EnvironmentTrustConfiguration = {
  allowedBrowserOrigins: string[]
  allowedRedirectOrigins: string[]
  oidcIssuer: string
  oidcClientId: string
  oidcAudience: string
  oidcJwksUrl: string
  oidcSubjectClaim: string
}

type EnvironmentAuditAction = Extract<
  NewAuditLog["action"],
  | "environment.created"
  | "environment.updated"
  | "environment.trust_configuration_updated"
  | "environment.disabled"
>

async function recordAudit(
  tx: Transaction,
  environment: Environment,
  actor: EnvironmentActor,
  action: EnvironmentAuditAction,
  metadata: Record<string, unknown> | null
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: environment.workspaceId,
    actorUserId: actor.userId,
    action,
    resource: "environment",
    resourceId: environment.id,
    metadata,
  })
}

export async function createEnvironment(
  db: DbClient,
  input: CreateEnvironmentInput,
  actor: EnvironmentActor
): Promise<Environment> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .insert(environments)
      .values(input)
      .returning()
    await recordAudit(tx, environment, actor, "environment.created", {
      environment: environment.environment,
    })
    return environment
  })
}

export async function getEnvironmentById(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<Environment | undefined> {
  const [environment] = await db
    .select()
    .from(environments)
    .where(
      and(eq(environments.workspaceId, workspaceId), eq(environments.id, id))
    )
  return environment
}

export async function listEnvironments(
  db: DbClient,
  workspaceId: string,
  applicationId: string
): Promise<Environment[]> {
  return db
    .select()
    .from(environments)
    .where(
      and(
        eq(environments.workspaceId, workspaceId),
        eq(environments.applicationId, applicationId)
      )
    )
    .orderBy(desc(environments.createdAt))
}

export async function updateEnvironmentProfile(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: UpdateEnvironmentProfileInput,
  actor: EnvironmentActor
): Promise<Environment | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [environment] = await tx
      .update(environments)
      .set({ ...input, updatedAt: now })
      .where(
        and(eq(environments.workspaceId, workspaceId), eq(environments.id, id))
      )
      .returning()
    if (!environment) return undefined
    await recordAudit(tx, environment, actor, "environment.updated", {
      changedFields: Object.keys(input).sort(),
    })
    return environment
  })
}

export async function replaceEnvironmentTrustConfiguration(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: EnvironmentTrustConfiguration,
  actor: EnvironmentActor
): Promise<Environment | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [environment] = await tx
      .update(environments)
      .set({ ...input, updatedAt: now })
      .where(
        and(eq(environments.workspaceId, workspaceId), eq(environments.id, id))
      )
      .returning()
    if (!environment) return undefined
    await tx
      .update(endUserSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(endUserSessions.environmentId, environment.id),
          isNull(endUserSessions.revokedAt)
        )
      )
    await tx
      .delete(endUserIdentityExchanges)
      .where(eq(endUserIdentityExchanges.environmentId, environment.id))
    await tx
      .delete(endUserAuthorizationRequests)
      .where(eq(endUserAuthorizationRequests.environmentId, environment.id))
    await recordAudit(
      tx,
      environment,
      actor,
      "environment.trust_configuration_updated",
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
    return environment
  })
}

export async function disableEnvironment(
  db: DbClient,
  workspaceId: string,
  id: string,
  actor: EnvironmentActor
): Promise<Environment | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(environments)
      .where(
        and(eq(environments.workspaceId, workspaceId), eq(environments.id, id))
      )
      .for("update")
    if (!existing || !existing.enabled) return existing
    const now = new Date()
    const [environment] = await tx
      .update(environments)
      .set({ enabled: false, updatedAt: now })
      .where(eq(environments.id, existing.id))
      .returning()
    await tx
      .update(endUserSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(endUserSessions.environmentId, environment.id),
          isNull(endUserSessions.revokedAt)
        )
      )
    await recordAudit(tx, environment, actor, "environment.disabled", null)
    return environment
  })
}

export async function replaceConnectorAccessPolicy(
  db: DbClient,
  workspaceId: string,
  id: string,
  connectorAccessPolicy: ConnectorAccessPolicy,
  actor: EnvironmentActor
): Promise<Environment | undefined> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .update(environments)
      .set({ connectorAccessPolicy, updatedAt: new Date() })
      .where(
        and(eq(environments.workspaceId, workspaceId), eq(environments.id, id))
      )
      .returning()
    if (!environment) return undefined
    await recordAudit(tx, environment, actor, "environment.updated", {
      changedFields: ["connectorAccessPolicy"],
    })
    return environment
  })
}

export async function isEnvironmentBrowserOriginAllowed(
  db: DbClient,
  workspaceId: string,
  id: string,
  origin: string
): Promise<boolean> {
  const [environment] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(
      and(
        eq(environments.workspaceId, workspaceId),
        eq(environments.id, id),
        eq(environments.enabled, true),
        sql`${origin} = ANY(${environments.allowedBrowserOrigins})`
      )
    )
  return Boolean(environment)
}

export async function getWorkflowEnvironment(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  name: Environment["environment"]
): Promise<Environment | undefined> {
  const [row] = await db
    .select({ environment: environments })
    .from(environments)
    .innerJoin(
      workflows,
      and(
        eq(workflows.applicationId, environments.applicationId),
        eq(workflows.workspaceId, environments.workspaceId)
      )
    )
    .where(
      and(
        eq(workflows.id, workflowId),
        eq(workflows.workspaceId, workspaceId),
        eq(environments.environment, name)
      )
    )
  return row?.environment
}

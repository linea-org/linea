import type { ExternalSubjectMetadata } from "@linea/protocol/resources"
import { randomUUID } from "node:crypto"
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"
import {
  environments,
  auditLogs,
  connectionRevocationDeliveries,
  connections,
  connectionAccessGrants,
  connectionReviewerAssignments,
  connectorAuditFacts,
  endUserSessions,
  externalSubjectEnvironments,
  externalSubjects,
  type ExternalSubject,
  type ExternalSubjectEnvironment,
} from "../schema/index.js"
import type { DbClient } from "./types.js"
import { cancelNonExecutingActionIntents } from "./action-intent-cancellation.repository.js"
import { recordConnectionFact } from "./connector-audit.repository.js"
import { createPublicEvent } from "./outbox-message.repository.js"

export type ExternalSubjectProjection = {
  subject: ExternalSubject
  environment: ExternalSubjectEnvironment
}

export type ProvisionExternalSubjectResult =
  | { outcome: "provisioned"; value: ExternalSubjectProjection }
  | { outcome: "environment_not_found" }
  | { outcome: "environment_disabled" }
  | { outcome: "external_subject_disabled" }

export async function provisionExternalSubject(
  db: DbClient,
  input: {
    workspaceId: string
    environmentId: string
    issuerSubject: string
    metadata: ExternalSubjectMetadata
  },
  actorEnvironmentKeyId: string
): Promise<ProvisionExternalSubjectResult> {
  return db.transaction(async (tx): Promise<ProvisionExternalSubjectResult> => {
    const [environment] = await tx
      .select({
        id: environments.id,
        enabled: environments.enabled,
        oidcIssuer: environments.oidcIssuer,
      })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, input.workspaceId),
          eq(environments.id, input.environmentId)
        )
      )
      .for("share")
    if (!environment) return { outcome: "environment_not_found" }
    if (!environment.enabled || !environment.oidcIssuer)
      return { outcome: "environment_disabled" }
    const [created] = await tx
      .insert(externalSubjects)
      .values({
        workspaceId: input.workspaceId,
        issuer: environment.oidcIssuer,
        issuerSubject: input.issuerSubject,
      })
      .onConflictDoNothing({
        target: [
          externalSubjects.workspaceId,
          externalSubjects.issuer,
          externalSubjects.issuerSubject,
        ],
      })
      .returning()
    const subject =
      created ??
      (
        await tx
          .select()
          .from(externalSubjects)
          .where(
            and(
              eq(externalSubjects.workspaceId, input.workspaceId),
              eq(externalSubjects.issuer, environment.oidcIssuer),
              eq(externalSubjects.issuerSubject, input.issuerSubject)
            )
          )
          .for("update")
      )[0]
    if (!subject) {
      throw new Error(
        "External Subject identity disappeared during provisioning"
      )
    }
    if (subject.status === "disabled") {
      return { outcome: "external_subject_disabled" }
    }
    const [createdSubjectEnvironment] = await tx
      .insert(externalSubjectEnvironments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: environment.id,
        externalSubjectId: subject.id,
        metadata: input.metadata,
      })
      .onConflictDoNothing({
        target: [
          externalSubjectEnvironments.environmentId,
          externalSubjectEnvironments.externalSubjectId,
        ],
      })
      .returning()
    const subjectEnvironment =
      createdSubjectEnvironment ??
      (
        await tx
          .update(externalSubjectEnvironments)
          .set({ metadata: input.metadata, updatedAt: new Date() })
          .where(
            and(
              eq(externalSubjectEnvironments.environmentId, environment.id),
              eq(externalSubjectEnvironments.externalSubjectId, subject.id)
            )
          )
          .returning()
      )[0]
    if (!subjectEnvironment) {
      throw new Error("External Subject Environment link disappeared")
    }
    if (created || createdSubjectEnvironment) {
      await tx.insert(auditLogs).values({
        workspaceId: input.workspaceId,
        actorEnvironmentKeyId,
        action: "external_subject.provisioned",
        resource: "external_subject",
        resourceId: subject.auditReference,
        metadata: { environmentId: environment.id },
      })
    }
    return {
      outcome: "provisioned",
      value: { subject, environment: subjectEnvironment },
    }
  })
}

export async function findExternalSubjectByIdentity(
  db: DbClient,
  workspaceId: string,
  issuer: string,
  issuerSubject: string
): Promise<ExternalSubject | undefined> {
  const [subject] = await db
    .select()
    .from(externalSubjects)
    .where(
      and(
        eq(externalSubjects.workspaceId, workspaceId),
        eq(externalSubjects.issuer, issuer),
        eq(externalSubjects.issuerSubject, issuerSubject)
      )
    )
  return subject
}

export async function getEnvironmentExternalSubject(
  db: DbClient,
  workspaceId: string,
  environmentId: string,
  externalSubjectId: string
): Promise<ExternalSubjectProjection | undefined> {
  const [result] = await db
    .select({
      subject: externalSubjects,
      environment: externalSubjectEnvironments,
    })
    .from(externalSubjectEnvironments)
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, externalSubjectEnvironments.externalSubjectId),
        eq(
          externalSubjects.workspaceId,
          externalSubjectEnvironments.workspaceId
        )
      )
    )
    .where(
      and(
        eq(externalSubjectEnvironments.workspaceId, workspaceId),
        eq(externalSubjectEnvironments.environmentId, environmentId),
        eq(externalSubjectEnvironments.externalSubjectId, externalSubjectId)
      )
    )
  return result
}

export async function disableExternalSubject(
  db: DbClient,
  workspaceId: string,
  externalSubjectId: string,
  actorUserId: string
): Promise<ExternalSubject | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(externalSubjects)
      .where(
        and(
          eq(externalSubjects.workspaceId, workspaceId),
          eq(externalSubjects.id, externalSubjectId)
        )
      )
      .for("update")
    if (!existing || existing.status === "erased") return existing
    if (existing.status === "disabled") return existing
    const now = new Date()
    await cancelNonExecutingActionIntents(tx, {
      workspaceId,
      scope: { kind: "external_subject", id: existing.id },
      actor: { kind: "workspace_member", id: actorUserId },
      cancelledAt: now,
    })
    const [subject] = await tx
      .update(externalSubjects)
      .set({ status: "disabled", disabledAt: now, updatedAt: now })
      .where(eq(externalSubjects.id, existing.id))
      .returning()
    await tx
      .update(endUserSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(endUserSessions.externalSubjectId, subject.id),
          isNull(endUserSessions.revokedAt)
        )
      )
    await tx.insert(auditLogs).values({
      workspaceId,
      actorUserId,
      action: "external_subject.disabled",
      resource: "external_subject",
      resourceId: subject.auditReference,
      metadata: null,
    })
    return subject
  })
}

export async function eraseExternalSubject(
  db: DbClient,
  workspaceId: string,
  externalSubjectId: string,
  actorUserId: string
): Promise<ExternalSubject | undefined> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(externalSubjects)
      .where(
        and(
          eq(externalSubjects.workspaceId, workspaceId),
          eq(externalSubjects.id, externalSubjectId)
        )
      )
      // Permit revocation audit FK locks while excluding new authority assignments.
      .for("no key update")
    if (!existing || existing.status === "erased") return existing
    const now = new Date()
    const auditReference = randomUUID()
    // Grant revocation locks authority before approvals; erasure must use the same order.
    const requesters = await tx
      .update(connectionAccessGrants)
      .set({ revokedAt: now })
      .where(
        and(
          eq(connectionAccessGrants.workspaceId, workspaceId),
          eq(connectionAccessGrants.externalSubjectId, existing.id),
          isNull(connectionAccessGrants.revokedAt)
        )
      )
      .returning()
    const reviewers = await tx
      .update(connectionReviewerAssignments)
      .set({ revokedAt: now })
      .where(
        and(
          eq(connectionReviewerAssignments.workspaceId, workspaceId),
          eq(connectionReviewerAssignments.externalSubjectId, existing.id),
          isNull(connectionReviewerAssignments.revokedAt)
        )
      )
      .returning()
    await cancelNonExecutingActionIntents(tx, {
      workspaceId,
      scope: { kind: "external_subject", id: existing.id },
      actor: { kind: "workspace_member", id: actorUserId },
      cancelledAt: now,
    })
    const revokedAuthorities = [
      ...requesters.map((authorization) => ({
        authorization,
        kind: "requester" as const,
      })),
      ...reviewers.map((authorization) => ({
        authorization,
        kind: "reviewer" as const,
      })),
    ]
    if (revokedAuthorities.length > 0)
      await tx.insert(auditLogs).values(
        revokedAuthorities.map<typeof auditLogs.$inferInsert>(
          ({ authorization, kind }) => ({
            workspaceId,
            actorUserId,
            action: `connection.${kind}_revoked`,
            resource: "connection",
            resourceId: authorization.connectionId,
            metadata: {
              authorizationId: authorization.id,
              subjectReference: auditReference,
            },
          })
        )
      )
    const revokedConnections = await tx
      .update(connections)
      .set({
        providerAccountId: sql`concat('erased:', ${auditReference}::text, ':', ${connections.id}::text)`,
        accountLabel: "Erased subject",
        status: "revoked",
        credentialEncrypted: null,
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(connections.workspaceId, workspaceId),
          eq(connections.externalSubjectId, existing.id),
          ne(connections.status, "revoked")
        )
      )
      .returning()
    const alreadyRevokedConnections = await tx
      .update(connections)
      .set({
        providerAccountId: sql`concat('erased:', ${auditReference}::text, ':', ${connections.id}::text)`,
        accountLabel: "Erased subject",
        credentialEncrypted: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(connections.workspaceId, workspaceId),
          eq(connections.externalSubjectId, existing.id),
          eq(connections.status, "revoked")
        )
      )
      .returning()
    const subjectConnections = [
      ...revokedConnections,
      ...alreadyRevokedConnections,
    ]
    const pendingPayloads = await tx
      .select()
      .from(connectionRevocationDeliveries)
      .where(
        and(
          eq(connectionRevocationDeliveries.workspaceId, workspaceId),
          eq(connectionRevocationDeliveries.externalSubjectId, existing.id),
          isNotNull(connectionRevocationDeliveries.credentialEncrypted)
        )
      )
      .for("update")
    const connectionsById = new Map(
      subjectConnections.map((connection) => [connection.id, connection])
    )
    for (const payload of pendingPayloads) {
      if (!payload.connectionId) continue
      const connection = connectionsById.get(payload.connectionId)
      if (!connection) throw new Error("Revocation Connection is missing")
      await recordConnectionFact(tx, {
        connection,
        factType: "connection.revocation_payload_destroyed",
        occurredAt: now,
        outcome: "subject_erased",
        failureClass: "subject_erased",
      })
    }
    if (pendingPayloads.length > 0) {
      await tx.delete(connectionRevocationDeliveries).where(
        inArray(
          connectionRevocationDeliveries.id,
          pendingPayloads.map(({ id }) => id)
        )
      )
    }
    for (const connection of revokedConnections) {
      await recordConnectionFact(tx, {
        connection,
        factType: "connection.revoked",
        occurredAt: now,
        outcome: "subject_erased",
      })
      await createPublicEvent(tx, {
        workspaceId: connection.workspaceId,
        environmentId: connection.environmentId,
        externalSubjectId: existing.id,
        eventType: "connection.revoked",
        data: { connectionId: connection.id },
      })
    }
    const [subject] = await tx
      .update(externalSubjects)
      .set({
        issuerSubject: null,
        status: "erased",
        auditReference,
        disabledAt: existing.disabledAt ?? now,
        erasedAt: now,
        updatedAt: now,
      })
      .where(eq(externalSubjects.id, existing.id))
      .returning()
    await tx
      .update(endUserSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(endUserSessions.externalSubjectId, subject.id),
          isNull(endUserSessions.revokedAt)
        )
      )
    await tx
      .update(connectorAuditFacts)
      .set({
        externalSubjectId: null,
        subjectReference: auditReference,
        content: null,
        contentErasedAt: now,
      })
      .where(eq(connectorAuditFacts.externalSubjectId, existing.id))
    await tx
      .update(auditLogs)
      .set({ resourceId: auditReference, actorExternalSubjectId: null })
      .where(
        and(
          eq(auditLogs.workspaceId, workspaceId),
          eq(auditLogs.resource, "external_subject"),
          eq(auditLogs.resourceId, existing.auditReference)
        )
      )
    await tx
      .update(externalSubjectEnvironments)
      .set({ metadata: {}, updatedAt: now })
      .where(
        and(
          eq(externalSubjectEnvironments.workspaceId, workspaceId),
          eq(externalSubjectEnvironments.externalSubjectId, existing.id)
        )
      )
    await tx.insert(auditLogs).values({
      workspaceId,
      actorUserId,
      action: "external_subject.erased",
      resource: "external_subject",
      resourceId: subject.auditReference,
      metadata: null,
    })
    return subject
  })
}

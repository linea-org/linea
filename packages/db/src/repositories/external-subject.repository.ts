import type { ExternalSubjectMetadata } from "@linea/protocol/resources"
import { and, eq, isNull } from "drizzle-orm"
import {
  applications,
  auditLogs,
  endUserSessions,
  externalSubjectApplications,
  externalSubjects,
  type ExternalSubject,
  type ExternalSubjectApplication,
} from "../schema/index.js"
import type { DbClient } from "./types.js"
import { cancelNonExecutingActionIntents } from "./action-intent-cancellation.repository.js"

export type ExternalSubjectProjection = {
  subject: ExternalSubject
  application: ExternalSubjectApplication
}

export type ProvisionExternalSubjectResult =
  | { outcome: "provisioned"; value: ExternalSubjectProjection }
  | { outcome: "application_not_found" }
  | { outcome: "application_disabled" }
  | { outcome: "external_subject_disabled" }

export async function provisionExternalSubject(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    issuerSubject: string
    metadata: ExternalSubjectMetadata
  },
  actorApplicationKeyId: string
): Promise<ProvisionExternalSubjectResult> {
  return db.transaction(async (tx): Promise<ProvisionExternalSubjectResult> => {
    const [application] = await tx
      .select({
        id: applications.id,
        enabled: applications.enabled,
        oidcIssuer: applications.oidcIssuer,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, input.workspaceId),
          eq(applications.id, input.applicationId)
        )
      )
      .for("share")
    if (!application) return { outcome: "application_not_found" }
    if (!application.enabled) return { outcome: "application_disabled" }
    const [created] = await tx
      .insert(externalSubjects)
      .values({
        workspaceId: input.workspaceId,
        issuer: application.oidcIssuer,
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
              eq(externalSubjects.issuer, application.oidcIssuer),
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
    const [createdSubjectApplication] = await tx
      .insert(externalSubjectApplications)
      .values({
        workspaceId: input.workspaceId,
        applicationId: application.id,
        externalSubjectId: subject.id,
        metadata: input.metadata,
      })
      .onConflictDoNothing({
        target: [
          externalSubjectApplications.applicationId,
          externalSubjectApplications.externalSubjectId,
        ],
      })
      .returning()
    const subjectApplication =
      createdSubjectApplication ??
      (
        await tx
          .update(externalSubjectApplications)
          .set({ metadata: input.metadata, updatedAt: new Date() })
          .where(
            and(
              eq(externalSubjectApplications.applicationId, application.id),
              eq(externalSubjectApplications.externalSubjectId, subject.id)
            )
          )
          .returning()
      )[0]
    if (!subjectApplication) {
      throw new Error("External Subject Application link disappeared")
    }
    if (created || createdSubjectApplication) {
      await tx.insert(auditLogs).values({
        workspaceId: input.workspaceId,
        actorApplicationKeyId,
        action: "external_subject.provisioned",
        resource: "external_subject",
        resourceId: subject.auditReference,
        metadata: { applicationId: application.id },
      })
    }
    return {
      outcome: "provisioned",
      value: { subject, application: subjectApplication },
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

export async function getApplicationExternalSubject(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string
): Promise<ExternalSubjectProjection | undefined> {
  const [result] = await db
    .select({
      subject: externalSubjects,
      application: externalSubjectApplications,
    })
    .from(externalSubjectApplications)
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, externalSubjectApplications.externalSubjectId),
        eq(
          externalSubjects.workspaceId,
          externalSubjectApplications.workspaceId
        )
      )
    )
    .where(
      and(
        eq(externalSubjectApplications.workspaceId, workspaceId),
        eq(externalSubjectApplications.applicationId, applicationId),
        eq(externalSubjectApplications.externalSubjectId, externalSubjectId)
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
      .for("update")
    if (!existing || existing.status === "erased") return existing
    const now = new Date()
    await cancelNonExecutingActionIntents(tx, {
      workspaceId,
      scope: { kind: "external_subject", id: existing.id },
      actor: { kind: "workspace_member", id: actorUserId },
      cancelledAt: now,
    })
    const [subject] = await tx
      .update(externalSubjects)
      .set({
        issuerSubject: null,
        status: "erased",
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
      .update(externalSubjectApplications)
      .set({ metadata: {}, updatedAt: now })
      .where(
        and(
          eq(externalSubjectApplications.workspaceId, workspaceId),
          eq(externalSubjectApplications.externalSubjectId, existing.id)
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

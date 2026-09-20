import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  actionIntents,
  applications,
  approvalRequests,
  connectionRevocationDeliveries,
  connections,
  connectorAuditFacts,
  externalSubjectApplications,
  externalSubjects,
  executions,
  outboxMessages,
  users,
  type ActionIntentEnvelope,
} from "../schema/index.js"
import {
  applyRetention,
  listEndUserFacts,
  listOperatorFacts,
  recordConnectionFact,
  recordActionIntentFact,
} from "./connector-audit.repository.js"
import { completeRevocationDelivery } from "./connection.repository.js"
import { eraseExternalSubject } from "./external-subject.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"

const secretMarker = "provider-secret-must-be-destroyed"

async function createAuditFixture(
  tx: DbClient,
  input: { workspaceId: string; suffix: string; contentRetentionDays?: number }
) {
  const [application] = await tx
    .insert(applications)
    .values({
      workspaceId: input.workspaceId,
      environment: "production",
      displayName: `Audit ${input.suffix}`,
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      contentRetentionDays: input.contentRetentionDays ?? 30,
      oidcIssuer: `https://identity-${input.suffix}.example.com`,
      oidcClientId: `audit-${input.suffix}`,
      oidcAudience: "linea",
      oidcJwksUrl: `https://identity-${input.suffix}.example.com/jwks.json`,
    })
    .returning()
  const [subject] = await tx
    .insert(externalSubjects)
    .values({
      workspaceId: input.workspaceId,
      issuer: application.oidcIssuer,
      issuerSubject: `subject-${input.suffix}`,
      status: "verified",
      verifiedAt: new Date(),
    })
    .returning()
  await tx.insert(externalSubjectApplications).values({
    workspaceId: input.workspaceId,
    applicationId: application.id,
    externalSubjectId: subject.id,
  })
  const [connection] = await tx
    .insert(connections)
    .values({
      workspaceId: input.workspaceId,
      applicationId: application.id,
      externalSubjectId: subject.id,
      provider: "github",
      providerAccountId: `account-${input.suffix}`,
      accountLabel: `Account ${input.suffix}`,
      status: "active",
      scopes: ["repo"],
      credentialEncrypted: secretMarker,
    })
    .returning()
  return { application, subject, connection }
}

describe("connector audit repository", () => {
  it("isolates workspace, Application, and End-User audiences", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const first = await createAuditFixture(tx, {
        workspaceId: organization.id,
        suffix: randomUUID(),
      })
      const second = await createAuditFixture(tx, {
        workspaceId: organization.id,
        suffix: randomUUID(),
      })
      const now = new Date()
      for (const fixture of [first, second]) {
        await recordConnectionFact(tx, {
          connection: fixture.connection,
          factType: "connection.created",
          occurredAt: now,
          outcome: "active",
          content: { accountLabel: fixture.connection.accountLabel },
        })
      }
      const workspaceFacts = await listOperatorFacts(tx, {
        workspaceId: organization.id,
        limit: 10,
        now,
      })
      const applicationFacts = await listOperatorFacts(tx, {
        workspaceId: organization.id,
        applicationId: first.application.id,
        limit: 10,
        now,
      })
      const endUserFacts = await listEndUserFacts(tx, {
        workspaceId: organization.id,
        applicationId: first.application.id,
        externalSubjectId: first.subject.id,
        limit: 10,
        now,
      })
      expect(workspaceFacts).toHaveLength(2)
      expect(
        applicationFacts.map(({ applicationId }) => applicationId)
      ).toEqual([first.application.id])
      expect(
        endUserFacts.map(({ externalSubjectId }) => externalSubjectId)
      ).toEqual([first.subject.id])
    })
  })

  it("erases retained content before deleting one-year evidence", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const fixture = await createAuditFixture(tx, {
        workspaceId: organization.id,
        suffix: randomUUID(),
        contentRetentionDays: 30,
      })
      const occurredAt = new Date("2025-09-20T00:00:00.000Z")
      await recordConnectionFact(tx, {
        connection: fixture.connection,
        factType: "connection.created",
        occurredAt,
        outcome: "active",
        content: { accountLabel: "Identifying account label" },
      })
      const [execution] = await tx
        .insert(executions)
        .values({
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          applicationId: fixture.application.id,
          externalSubjectRecordId: fixture.subject.id,
          trigger: "api",
          environment: "production",
          status: "running",
        })
        .returning()
      const digest = "a".repeat(43)
      const [approval] = await tx
        .insert(approvalRequests)
        .values({
          workspaceId: organization.id,
          applicationId: fixture.application.id,
          workflowId: workflow.id,
          executionId: execution.id,
          nodeId: "audit-retention",
          audience: "external_subject",
          externalSubjectId: fixture.subject.id,
          status: "decided",
          display: { title: "Sensitive display" },
          timeoutAction: "auto_reject",
          actionIntentDigest: digest,
          requestedAt: occurredAt,
        })
        .returning()
      const canonicalEnvelope = {
        version: 1,
        operationRevision: "1",
        connectionId: fixture.connection.id,
        connector: fixture.connection.provider,
        operation: "github.issue.create",
        target: { repository: "private/repository" },
        parameters: { body: secretMarker },
        providerPreconditions: { version: "private-version" },
      } satisfies ActionIntentEnvelope
      const [intent] = await tx
        .insert(actionIntents)
        .values({
          workspaceId: organization.id,
          applicationId: fixture.application.id,
          externalSubjectId: fixture.subject.id,
          connectionId: fixture.connection.id,
          workflowId: workflow.id,
          executionId: execution.id,
          nodeId: "audit-retention",
          approvalRequestId: approval.id,
          connector: fixture.connection.provider,
          operationId: canonicalEnvelope.operation,
          operationRevision: canonicalEnvelope.operationRevision,
          target: canonicalEnvelope.target,
          normalizedParameters: canonicalEnvelope.parameters,
          providerPreconditions: canonicalEnvelope.providerPreconditions,
          safeDisplay: { title: "Sensitive display" },
          digestVersion: "jcs-sha256-v1",
          canonicalDigest: digest,
          canonicalEnvelope,
          invocationIdempotencyKey: "audit-retention",
          status: "succeeded",
          executionClaimId: "audit-retention-claim",
          normalizedResult: { providerId: "private-result" },
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })
        .returning()
      await recordActionIntentFact(tx, {
        intent,
        factType: "action_intent.succeeded",
        occurredAt,
        outcome: "succeeded",
      })
      const afterContentRetention = new Date("2025-10-21T00:00:00.000Z")
      expect(await applyRetention(tx, afterContentRetention)).toMatchObject({
        contentErased: 2,
        intentsErased: 1,
        factsDeleted: 0,
      })
      const [retained] = await tx
        .select()
        .from(connectorAuditFacts)
        .where(eq(connectorAuditFacts.factType, "connection.created"))
      expect(retained).toMatchObject({
        content: null,
        outcome: "active",
        connectionId: fixture.connection.id,
      })
      const [redactedIntent] = await tx
        .select()
        .from(actionIntents)
        .where(eq(actionIntents.id, intent.id))
      expect(redactedIntent).toMatchObject({
        target: { redacted: true },
        normalizedParameters: { redacted: true },
        providerPreconditions: { redacted: true },
        safeDisplay: { title: "Content expired" },
        normalizedResult: null,
      })
      await expect(
        tx.transaction(async (savepoint) => {
          await savepoint
            .update(actionIntents)
            .set({ normalizedResult: { restored: secretMarker } })
            .where(eq(actionIntents.id, intent.id))
        })
      ).rejects.toThrow()
      const [redactedApproval] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, approval.id))
      expect(redactedApproval?.display).toEqual({ title: "Content expired" })
      expect(
        await applyRetention(tx, new Date("2026-09-20T00:00:00.001Z"))
      ).toMatchObject({ factsDeleted: 2 })
      expect(await tx.select().from(connectorAuditFacts)).toEqual([])
    })
  })

  it("rotates to a new pseudonym and removes identifying subject content", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const fixture = await createAuditFixture(tx, {
        workspaceId: organization.id,
        suffix: randomUUID(),
      })
      const [actor] = await tx
        .insert(users)
        .values({ name: "Admin", email: `${randomUUID()}@example.com` })
        .returning()
      await recordConnectionFact(tx, {
        connection: fixture.connection,
        factType: "connection.created",
        occurredAt: new Date(),
        outcome: "active",
        content: { accountLabel: fixture.connection.accountLabel },
      })
      const payloadId = randomUUID()
      await tx.insert(connectionRevocationDeliveries).values({
        id: payloadId,
        workspaceId: organization.id,
        connectionId: fixture.connection.id,
        provider: fixture.connection.provider,
        credentialEncrypted: secretMarker,
        expiresAt: new Date(Date.now() + 60_000),
      })
      const erased = await eraseExternalSubject(
        tx,
        organization.id,
        fixture.subject.id,
        actor.id
      )
      expect(erased?.auditReference).not.toBe(fixture.subject.auditReference)
      const facts = await tx.select().from(connectorAuditFacts)
      expect(facts.length).toBeGreaterThan(0)
      expect(
        facts.every(({ externalSubjectId }) => externalSubjectId === null)
      ).toBe(true)
      expect(
        facts.every(
          ({ subjectReference }) => subjectReference === erased?.auditReference
        )
      ).toBe(true)
      expect(facts.every(({ content }) => content === null)).toBe(true)
      expect(
        facts.some(
          ({ factType, outcome }) =>
            factType === "connection.revocation_payload_destroyed" &&
            outcome === "subject_erased"
        )
      ).toBe(true)
      const [connection] = await tx
        .select()
        .from(connections)
        .where(eq(connections.id, fixture.connection.id))
      expect(connection).toMatchObject({
        accountLabel: "Erased subject",
        credentialEncrypted: null,
        status: "revoked",
      })
      expect(connection?.providerAccountId).not.toContain(
        fixture.connection.providerAccountId
      )
      expect(
        await tx
          .select()
          .from(connectionRevocationDeliveries)
          .where(eq(connectionRevocationDeliveries.id, payloadId))
      ).toEqual([])
      const events = await tx
        .select()
        .from(outboxMessages)
        .where(eq(outboxMessages.eventType, "connection.revoked"))
      expect(events).toHaveLength(1)
      expect(events[0]?.payload).toEqual({
        connectionId: fixture.connection.id,
      })
      expect(JSON.stringify(events)).not.toContain(secretMarker)
      expect(JSON.stringify(facts)).not.toContain(secretMarker)
    })
  })

  it("audits revocation payload destruction without retaining its secret", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const fixture = await createAuditFixture(tx, {
        workspaceId: organization.id,
        suffix: randomUUID(),
      })
      const deliveryId = randomUUID()
      await tx.insert(connectionRevocationDeliveries).values({
        id: deliveryId,
        workspaceId: organization.id,
        connectionId: fixture.connection.id,
        provider: fixture.connection.provider,
        credentialEncrypted: secretMarker,
        expiresAt: new Date(Date.now() + 60_000),
        claimedBy: "worker",
      })
      expect(
        await completeRevocationDelivery(tx, {
          deliveryId,
          claimedBy: "worker",
          deliveredAt: new Date(),
        })
      ).toBe(true)
      const [delivery] = await tx
        .select()
        .from(connectionRevocationDeliveries)
        .where(eq(connectionRevocationDeliveries.id, deliveryId))
      const [fact] = await tx
        .select()
        .from(connectorAuditFacts)
        .where(
          eq(
            connectorAuditFacts.factType,
            "connection.revocation_payload_destroyed"
          )
        )
      expect(delivery?.credentialEncrypted).toBeNull()
      expect(fact).toMatchObject({ outcome: "delivered", failureClass: null })
      expect(JSON.stringify(fact)).not.toContain(secretMarker)
    })
  })
})

import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  applications,
  externalSubjectApplications,
  externalSubjects,
} from "../schema/index.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import {
  claimWorkflowExecutionMessage,
  createPublicEvent,
  createWorkflowExecutionMessage,
  getOutboxMessages,
  markOutboxMessagePublished,
  recordOutboxMessageFailure,
} from "./outbox-message.repository.js"

describe("outbox message repository", () => {
  it("stores workflow dispatch and public events in the caller transaction", async () => {
    await withRollback(async (tx) => {
      const fixture = await createTestFixtures(tx)
      const workflowMessage = await createWorkflowExecutionMessage(tx, {
        workspaceId: fixture.organization.id,
        executionId: "00000000-0000-4000-8000-000000000001",
      })
      expect(workflowMessage).toMatchObject({
        kind: "workflow_execution",
        status: "pending",
        attempts: 0,
        payload: { executionId: "00000000-0000-4000-8000-000000000001" },
      })
      const [application] = await tx
        .insert(applications)
        .values({
          workspaceId: fixture.organization.id,
          environment: "production",
          displayName: "Outbox test",
          allowedBrowserOrigins: ["https://app.example.com"],
          allowedRedirectOrigins: ["https://app.example.com"],
          oidcIssuer: "https://identity.example.com",
          oidcClientId: "outbox",
          oidcAudience: "linea",
          oidcJwksUrl: "https://identity.example.com/jwks.json",
        })
        .returning()
      const [externalSubject] = await tx
        .insert(externalSubjects)
        .values({
          workspaceId: fixture.organization.id,
          issuer: "https://identity.example.com",
          issuerSubject: "outbox-subject",
          status: "verified",
          verifiedAt: new Date(),
        })
        .returning()
      await tx.insert(externalSubjectApplications).values({
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: externalSubject.id,
      })
      await expect(
        createPublicEvent(tx, {
          workspaceId: fixture.organization.id,
          applicationId: application.id,
          externalSubjectId: externalSubject.id,
          eventType: "approval_request.created",
          data: { approvalRequestId: "request-1" },
        })
      ).resolves.toMatchObject({
        kind: "public_event",
        eventType: "approval_request.created",
        applicationId: application.id,
        externalSubjectId: externalSubject.id,
      })
    })
  })

  it("lets one dispatcher claim a row and reclaims an expired lease", async () => {
    const fixture = await db.transaction((tx) => createTestFixtures(tx))
    try {
      const message = await createWorkflowExecutionMessage(db, {
        workspaceId: fixture.organization.id,
        executionId: "00000000-0000-4000-8000-000000000001",
      })
      const now = new Date()
      const claims = await Promise.all([
        claimWorkflowExecutionMessage(db, {
          claimedBy: "dispatcher-a",
          now,
          claimExpiresAt: new Date(now.getTime() + 30_000),
        }),
        claimWorkflowExecutionMessage(db, {
          claimedBy: "dispatcher-b",
          now,
          claimExpiresAt: new Date(now.getTime() + 30_000),
        }),
      ])
      expect(claims.filter(Boolean)).toHaveLength(1)
      await expect(
        claimWorkflowExecutionMessage(db, {
          claimedBy: "dispatcher-c",
          now: new Date(now.getTime() + 30_001),
          claimExpiresAt: new Date(now.getTime() + 60_001),
        })
      ).resolves.toMatchObject({ id: message.id, attempts: 2 })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        fixture.organization.id,
      ])
    }
  })

  it("fences completion and records retry and poison states", async () => {
    await withRollback(async (tx) => {
      const fixture = await createTestFixtures(tx)
      const message = await createWorkflowExecutionMessage(tx, {
        workspaceId: fixture.organization.id,
        executionId: "00000000-0000-4000-8000-000000000001",
      })
      const now = new Date()
      const firstClaim = await claimWorkflowExecutionMessage(tx, {
        claimedBy: "dispatcher-a",
        now,
        claimExpiresAt: new Date(now.getTime() + 30_000),
      })
      expect(firstClaim?.attempts).toBe(1)
      await expect(
        markOutboxMessagePublished(tx, {
          messageId: message.id,
          claimedBy: "dispatcher-b",
          publishedAt: new Date(now.getTime() + 1_000),
        })
      ).resolves.toBeUndefined()
      await expect(
        recordOutboxMessageFailure(tx, {
          messageId: message.id,
          claimedBy: "dispatcher-a",
          error: "Redis unavailable",
          failedAt: new Date(now.getTime() + 1_000),
          retryAt: new Date(now.getTime() + 2_000),
          maximumAttempts: 2,
        })
      ).resolves.toMatchObject({
        status: "pending",
        attempts: 1,
        lastError: "Redis unavailable",
      })
      await claimWorkflowExecutionMessage(tx, {
        claimedBy: "dispatcher-b",
        now: new Date(now.getTime() + 2_000),
        claimExpiresAt: new Date(now.getTime() + 32_000),
      })
      await expect(
        recordOutboxMessageFailure(tx, {
          messageId: message.id,
          claimedBy: "dispatcher-b",
          error: "Invalid payload",
          failedAt: new Date(now.getTime() + 3_000),
          retryAt: new Date(now.getTime() + 4_000),
          maximumAttempts: 2,
        })
      ).resolves.toMatchObject({
        status: "failed",
        attempts: 2,
        failedAt: new Date(now.getTime() + 3_000),
        lastError: "Invalid payload",
      })
      await expect(getOutboxMessages(tx, [message.id])).resolves.toMatchObject([
        { status: "failed" },
      ])
    })
  })

  it("marks a claimed message published exactly once", async () => {
    await withRollback(async (tx) => {
      const fixture = await createTestFixtures(tx)
      const message = await createWorkflowExecutionMessage(tx, {
        workspaceId: fixture.organization.id,
        executionId: "00000000-0000-4000-8000-000000000001",
      })
      const now = new Date()
      await claimWorkflowExecutionMessage(tx, {
        claimedBy: "dispatcher-a",
        now,
        claimExpiresAt: new Date(now.getTime() + 30_000),
      })
      const published = await markOutboxMessagePublished(tx, {
        messageId: message.id,
        claimedBy: "dispatcher-a",
        publishedAt: new Date(now.getTime() + 1_000),
      })
      expect(published).toMatchObject({
        status: "published",
        publishedAt: new Date(now.getTime() + 1_000),
      })
      await expect(
        markOutboxMessagePublished(tx, {
          messageId: message.id,
          claimedBy: "dispatcher-a",
          publishedAt: new Date(now.getTime() + 2_000),
        })
      ).resolves.toBeUndefined()
    })
  })
})

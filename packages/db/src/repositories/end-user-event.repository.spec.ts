import { eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  applications,
  endUserEventStreams,
  endUserSessions,
  externalSubjectApplications,
  externalSubjects,
  outboxMessages,
} from "../schema/index.js"
import { createPublicEvent } from "./outbox-message.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"
import {
  acquireEndUserEventStream,
  listEndUserEvents,
  renewEndUserEventStream,
} from "./end-user-event.repository.js"

async function createApplicationAndSubjects(client: Transaction) {
  const fixture = await createTestFixtures(client)
  const [application] = await client
    .insert(applications)
    .values({
      workspaceId: fixture.organization.id,
      environment: "production",
      displayName: "Event test",
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "events",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  const subjects = await client
    .insert(externalSubjects)
    .values([
      {
        workspaceId: fixture.organization.id,
        issuer: "https://identity.example.com",
        issuerSubject: `subject-a-${randomUUID()}`,
        status: "verified",
        verifiedAt: new Date(),
      },
      {
        workspaceId: fixture.organization.id,
        issuer: "https://identity.example.com",
        issuerSubject: `subject-b-${randomUUID()}`,
        status: "verified",
        verifiedAt: new Date(),
      },
    ])
    .returning()
  await client.insert(externalSubjectApplications).values(
    subjects.map((subject) => ({
      workspaceId: fixture.organization.id,
      applicationId: application.id,
      externalSubjectId: subject.id,
    }))
  )
  return { fixture, application, subjects }
}

describe("end-user event repository", () => {
  it("resumes ordered subject events and applies conversation and type filters", async () => {
    await withRollback(async (tx) => {
      const { fixture, application, subjects } =
        await createApplicationAndSubjects(tx)
      const first = await createPublicEvent(tx, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        eventType: "approval_request.created",
        data: {
          approvalRequestId: randomUUID(),
          conversationId: "00000000-0000-4000-8000-000000000001",
        },
      })
      const second = await createPublicEvent(tx, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        eventType: "approval_request.decided",
        data: {
          approvalRequestId: randomUUID(),
          conversationId: "00000000-0000-4000-8000-000000000002",
        },
      })
      await createPublicEvent(tx, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[1].id,
        eventType: "approval_request.created",
        data: { approvalRequestId: randomUUID() },
      })
      const retainedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      await expect(
        listEndUserEvents(tx, {
          workspaceId: fixture.organization.id,
          applicationId: application.id,
          externalSubjectId: subjects[0].id,
          conversationId: undefined,
          eventTypes: undefined,
          afterEventId: first.id,
          retainedAfter,
          limit: 100,
        })
      ).resolves.toEqual({ outcome: "events", events: [second] })
      await expect(
        listEndUserEvents(tx, {
          workspaceId: fixture.organization.id,
          applicationId: application.id,
          externalSubjectId: subjects[0].id,
          conversationId: "00000000-0000-4000-8000-000000000001",
          eventTypes: ["approval_request.created"],
          afterEventId: undefined,
          retainedAfter,
          limit: 100,
        })
      ).resolves.toEqual({ outcome: "events", events: [first] })
      await expect(
        listEndUserEvents(tx, {
          workspaceId: fixture.organization.id,
          applicationId: application.id,
          externalSubjectId: subjects[1].id,
          conversationId: undefined,
          eventTypes: undefined,
          afterEventId: first.id,
          retainedAfter,
          limit: 100,
        })
      ).resolves.toEqual({ outcome: "cursor_expired" })
    })
  })

  it("rejects cursors outside the retention window", async () => {
    await withRollback(async (tx) => {
      const { fixture, application, subjects } =
        await createApplicationAndSubjects(tx)
      const event = await createPublicEvent(tx, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        eventType: "approval_request.created",
        data: { approvalRequestId: randomUUID() },
      })
      const retainedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      await tx
        .update(outboxMessages)
        .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
        .where(eq(outboxMessages.id, event.id))
      await expect(
        listEndUserEvents(tx, {
          workspaceId: fixture.organization.id,
          applicationId: application.id,
          externalSubjectId: subjects[0].id,
          conversationId: undefined,
          eventTypes: undefined,
          afterEventId: event.id,
          retainedAfter,
          limit: 100,
        })
      ).resolves.toEqual({ outcome: "cursor_expired" })
    })
  })

  it("prevents later subject events from committing around an earlier event", async () => {
    const { fixture, application, subjects } = await db.transaction((tx) =>
      createApplicationAndSubjects(tx)
    )
    const cursor = await createPublicEvent(db, {
      workspaceId: fixture.organization.id,
      applicationId: application.id,
      externalSubjectId: subjects[0].id,
      eventType: "approval_request.created",
      data: { approvalRequestId: randomUUID() },
    })
    let signalInserted = () => {}
    const inserted = new Promise<void>((resolve) => {
      signalInserted = resolve
    })
    let releaseEarlier = () => {}
    const mayCommit = new Promise<void>((resolve) => {
      releaseEarlier = resolve
    })
    const earlierTransaction = db.transaction(async (tx) => {
      const event = await createPublicEvent(tx, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        eventType: "approval_request.created",
        data: { approvalRequestId: randomUUID() },
      })
      signalInserted()
      await mayCommit
      return event
    })
    await inserted
    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '100ms'`)
          return createPublicEvent(tx, {
            workspaceId: fixture.organization.id,
            applicationId: application.id,
            externalSubjectId: subjects[0].id,
            eventType: "approval_request.decided",
            data: { approvalRequestId: randomUUID() },
          })
        })
      ).rejects.toMatchObject({ cause: { code: "55P03" } })
    } finally {
      releaseEarlier()
    }
    try {
      const earlier = await earlierTransaction
      const later = await createPublicEvent(db, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        eventType: "approval_request.decided",
        data: { approvalRequestId: randomUUID() },
      })
      await expect(
        listEndUserEvents(db, {
          workspaceId: fixture.organization.id,
          applicationId: application.id,
          externalSubjectId: subjects[0].id,
          conversationId: undefined,
          eventTypes: undefined,
          afterEventId: cursor.id,
          retainedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          limit: 100,
        })
      ).resolves.toEqual({ outcome: "events", events: [earlier, later] })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        fixture.organization.id,
      ])
    }
  })

  it("enforces three distributed leases, recovers expiry, and observes revocation", async () => {
    const { fixture, application, subjects } = await db.transaction((tx) =>
      createApplicationAndSubjects(tx)
    )
    const [session] = await db
      .insert(endUserSessions)
      .values({
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        tokenHash: randomUUID(),
        proofJkt: randomUUID(),
        nonceHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning()
    const now = new Date()
    const acquire = () =>
      acquireEndUserEventStream(db, {
        workspaceId: fixture.organization.id,
        applicationId: application.id,
        externalSubjectId: subjects[0].id,
        sessionId: session.id,
        now,
        leaseExpiresAt: new Date(now.getTime() + 30_000),
        maximumStreams: 3,
      })
    try {
      const streams = await Promise.all([acquire(), acquire(), acquire()])
      expect(streams.every(Boolean)).toBe(true)
      await expect(acquire()).resolves.toBeUndefined()
      const firstStream = streams[0]
      if (!firstStream) throw new Error("Event stream lease was not acquired")
      await db
        .update(endUserEventStreams)
        .set({ leaseExpiresAt: new Date(now.getTime() - 1) })
        .where(eq(endUserEventStreams.id, firstStream.id))
      const replacement = await acquire()
      if (!replacement) throw new Error("Event stream lease was not replaced")
      await db
        .update(endUserSessions)
        .set({ revokedAt: now })
        .where(eq(endUserSessions.id, session.id))
      await expect(
        renewEndUserEventStream(db, {
          streamId: replacement.id,
          sessionId: session.id,
          now,
          leaseExpiresAt: new Date(now.getTime() + 60_000),
        })
      ).resolves.toBe(false)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        fixture.organization.id,
      ])
    }
  })
})

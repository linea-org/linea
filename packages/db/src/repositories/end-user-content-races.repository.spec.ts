import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  conversations,
  environments,
  executions,
  externalSubjectEnvironments,
  externalSubjects,
} from "../schema/index.js"
import { applyContentRetention } from "./end-user-content.repository.js"
import { resolveSubject } from "./public-runtime.repository.js"
import {
  createTestFixtures,
  fixtureIssuer,
  getTestApplicationId,
} from "./test-utils.js"
import type { Transaction } from "./types.js"

const DAY_MS = 24 * 60 * 60 * 1_000

/** Committed rows, because each race needs two connections that can see each other's work. */
async function createRaceFixture(tx: Transaction) {
  const fixtures = await createTestFixtures(tx)
  const [environment] = await tx
    .insert(environments)
    .values({
      applicationId: await getTestApplicationId(tx, fixtures.organization.id),
      workspaceId: fixtures.organization.id,
      environment: "production",
      displayName: "Content races",
      contentRetentionDays: 30,
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "content-races",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  const [subject] = await tx
    .insert(externalSubjects)
    .values({
      workspaceId: fixtures.organization.id,
      issuer: fixtureIssuer(environment) ?? "https://identity.example.com",
      issuerSubject: randomUUID(),
      status: "verified",
      verifiedAt: new Date(),
    })
    .returning()
  await tx.insert(externalSubjectEnvironments).values({
    workspaceId: fixtures.organization.id,
    environmentId: environment.id,
    externalSubjectId: subject.id,
  })
  const idleSince = new Date(Date.now() - 31 * DAY_MS)
  const [conversation] = await tx
    .insert(conversations)
    .values({
      workspaceId: fixtures.organization.id,
      environmentId: environment.id,
      workflowId: fixtures.workflow.id,
      externalSubjectId: subject.id,
      environment: "production",
      createdAt: idleSince,
      lastActivityAt: idleSince,
    })
    .returning()
  await tx.insert(executions).values({
    workspaceId: fixtures.organization.id,
    workflowId: fixtures.workflow.id,
    workflowVersionId: fixtures.version.id,
    environmentId: environment.id,
    externalSubjectRecordId: subject.id,
    conversationId: conversation.id,
    trigger: "api",
    environment: "production",
    status: "succeeded",
  })
  return { ...fixtures, environment, subject, conversation }
}

async function deleteRaceFixture(
  fixture: Awaited<ReturnType<typeof createRaceFixture>>
) {
  await pool.query("DELETE FROM organizations WHERE id = $1", [
    fixture.organization.id,
  ])
}

/** Resolves once a backend is blocked on a row lock inside a statement that mentions `table`. */
async function waitForLockWait(table: string) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const waiting = await pool.query(
      `SELECT 1 FROM pg_stat_activity
       WHERE datname = current_database()
         AND wait_event_type = 'Lock'
         AND query ILIKE '%' || $1 || '%'`,
      [`"${table}"`]
    )
    if (waiting.rowCount) return
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Nothing waited on a lock for ${table}`)
}

function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

describe("End-User content races", () => {
  it("keeps a Conversation whose active Execution commits while retention waits on its lock", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const inserted = gate()
      const commit = gate()
      // The insert's foreign-key lock on the Conversation blocks retention's FOR UPDATE, but the
      // idle-Conversation filter already ran before that wait and cannot see this Execution.
      const writer = db.transaction(async (tx) => {
        await tx.insert(executions).values({
          workspaceId: fixture.organization.id,
          workflowId: fixture.workflow.id,
          workflowVersionId: fixture.version.id,
          environmentId: fixture.environment.id,
          externalSubjectRecordId: fixture.subject.id,
          conversationId: fixture.conversation.id,
          trigger: "api",
          environment: "production",
          status: "queued",
        })
        inserted.open()
        await commit.opened
      })
      await inserted.opened
      const retention = applyContentRetention(db, new Date())
      await waitForLockWait("conversations")
      commit.open()
      await writer
      await retention
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, fixture.conversation.id))
      expect(conversation).toBeDefined()
      const live = await db
        .select()
        .from(executions)
        .where(eq(executions.conversationId, fixture.conversation.id))
      expect(live.map(({ status }) => status).sort()).toEqual([
        "queued",
        "succeeded",
      ])
    } finally {
      await deleteRaceFixture(fixture)
    }
  })

  it("makes a locking subject read wait for an erasure in flight and then see the erased subject", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const locked = gate()
      const finish = gate()
      // Erasure holds FOR NO KEY UPDATE, which an insert's plain foreign-key lock does not conflict with.
      const erasure = db.transaction(async (tx) => {
        await tx
          .select({ id: externalSubjects.id })
          .from(externalSubjects)
          .where(eq(externalSubjects.id, fixture.subject.id))
          .for("no key update")
        await tx
          .update(externalSubjects)
          .set({
            status: "erased",
            issuerSubject: null,
            disabledAt: new Date(),
            erasedAt: new Date(),
          })
          .where(eq(externalSubjects.id, fixture.subject.id))
        locked.open()
        await finish.opened
      })
      await locked.opened
      const read = (options?: { lock: boolean }) =>
        resolveSubject(
          db,
          fixture.organization.id,
          fixture.environment.id,
          fixture.subject.id,
          options
        )
      // Without the lock a writer reads the committed, un-erased row and would go on to insert.
      expect(await read()).toBeDefined()
      const writer = db.transaction((tx) =>
        resolveSubject(
          tx,
          fixture.organization.id,
          fixture.environment.id,
          fixture.subject.id,
          { lock: true }
        )
      )
      await waitForLockWait("external_subjects")
      finish.open()
      await erasure
      expect(await writer).toBeUndefined()
    } finally {
      await deleteRaceFixture(fixture)
    }
  })
})

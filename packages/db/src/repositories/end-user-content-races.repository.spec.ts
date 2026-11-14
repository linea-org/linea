import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import {
  conversations,
  environments,
  executionSteps,
  executions,
  externalSubjectEnvironments,
  externalSubjects,
  regressionCases,
  regressionResults,
} from "../schema/index.js"
import { applyContentRetention } from "./end-user-content.repository.js"
import {
  lockExternalSubject,
  resolveSubject,
} from "./public-runtime.repository.js"
import {
  createRegressionCase,
  createRegressionCaseFromStep,
} from "./regression-case.repository.js"
import {
  createRegressionRun,
  insertRegressionResults,
} from "./regression-run.repository.js"
import {
  createTestFixtures,
  fixtureIssuer,
  getTestApplicationId,
} from "./test-utils.js"
import type { Transaction } from "./types.js"

const DAY_MS = 24 * 60 * 60 * 1_000

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
  const issuer = fixtureIssuer(environment)
  if (!issuer) throw new Error("Fixture identity trust missing")
  const [subject] = await tx
    .insert(externalSubjects)
    .values({
      workspaceId: fixtures.organization.id,
      issuer,
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

async function deleteOrganization(organizationId: string) {
  await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId])
}

async function waitForLockWait(table: string) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const waiting = await pool.query(
      `SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%' || $1 || '%'`,
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
      await deleteOrganization(fixture.organization.id)
    }
  })
  it("makes a locking subject read wait for an erasure in flight and then see the erased subject", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const locked = gate()
      const finish = gate()
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
      const resolve = (client: Transaction | typeof db) =>
        resolveSubject(
          client,
          fixture.organization.id,
          fixture.environment.id,
          fixture.subject.id
        )
      expect(await resolve(db)).toBeDefined()
      const writer = db.transaction(async (tx) => {
        await lockExternalSubject(
          tx,
          fixture.organization.id,
          fixture.subject.id
        )
        return resolve(tx)
      })
      await waitForLockWait("external_subjects")
      finish.open()
      await erasure
      expect(await writer).toBeUndefined()
    } finally {
      await deleteOrganization(fixture.organization.id)
    }
  })
  it("stores a result without its output when the case is erased while the run is in flight", async () => {
    const fixture = await db.transaction(createTestFixtures)
    try {
      const regressionCase = await createRegressionCase(db, {
        workspaceId: fixture.organization.id,
        workflowId: fixture.workflow.id,
        caseType: "conversation",
        input: { turns: [{ role: "user", content: "private question" }] },
      })
      const run = await createRegressionRun(db, {
        workspaceId: fixture.organization.id,
        workflowId: fixture.workflow.id,
        workflowVersionId: fixture.version.id,
        trigger: "manual",
      })
      const locked = gate()
      const finish = gate()
      const erasure = db.transaction(async (tx) => {
        await tx
          .select({ id: regressionCases.id })
          .from(regressionCases)
          .where(eq(regressionCases.id, regressionCase.id))
          .for("update")
        await tx
          .delete(regressionCases)
          .where(eq(regressionCases.id, regressionCase.id))
        locked.open()
        await finish.opened
      })
      await locked.opened
      const writer = insertRegressionResults(
        db,
        run.id,
        fixture.organization.id,
        [
          {
            caseId: regressionCase.id,
            status: "passed",
            output: [{ role: "user", content: "private question" }],
          },
        ]
      )
      await waitForLockWait("regression_cases")
      finish.open()
      await erasure
      await writer
      const stored = await db
        .select()
        .from(regressionResults)
        .where(eq(regressionResults.runId, run.id))
      expect(stored).toHaveLength(1)
      expect(stored[0].output).toBeNull()
    } finally {
      await deleteOrganization(fixture.organization.id)
    }
  })
  it("saves no case from a step that an erasure in flight deletes", async () => {
    const fixture = await db.transaction(createRaceFixture)
    try {
      const [execution] = await db
        .select()
        .from(executions)
        .where(eq(executions.conversationId, fixture.conversation.id))
      const [step] = await db
        .insert(executionSteps)
        .values({
          executionId: execution.id,
          workspaceId: fixture.organization.id,
          traceId: "trace",
          spanId: randomUUID(),
          name: "agent",
          startedAt: new Date(),
          nodeId: "agent",
          sequence: 0,
          input: { prompt: "private prompt" },
        })
        .returning()
      const locked = gate()
      const finish = gate()
      const erasure = db.transaction(async (tx) => {
        await tx
          .select({ id: executions.id })
          .from(executions)
          .where(eq(executions.id, execution.id))
          .for("update")
        await tx.delete(executionSteps).where(eq(executionSteps.id, step.id))
        locked.open()
        await finish.opened
      })
      await locked.opened
      const writer = createRegressionCaseFromStep(db, {
        workspaceId: fixture.organization.id,
        stepId: step.id,
      })
      await waitForLockWait("executions")
      finish.open()
      await erasure
      expect(await writer).toBeUndefined()
      const cases = await db
        .select()
        .from(regressionCases)
        .where(eq(regressionCases.workspaceId, fixture.organization.id))
      expect(cases).toHaveLength(0)
    } finally {
      await deleteOrganization(fixture.organization.id)
    }
  })
})

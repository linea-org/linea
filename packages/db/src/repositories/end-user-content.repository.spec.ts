import { randomUUID } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  actionIntents,
  approvalDecisions,
  approvalRequests,
  chatMessages,
  connections,
  conversations,
  executionSteps,
  executions,
  externalSubjectEnvironments,
  externalSubjects,
  flags,
  outboxMessages,
  publicIdempotencyRecords,
  users,
  type ActionIntentEnvelope,
} from "../schema/index.js"
import { createApplication } from "./application.repository.js"
import { applyContentRetention } from "./end-user-content.repository.js"
import { eraseExternalSubject } from "./external-subject.repository.js"
import { getPublicExecution } from "./public-runtime.repository.js"
import {
  configureTestEnvironment,
  createTestFixtures,
  fixtureIssuer,
  withRollback,
} from "./test-utils.js"
import type { DbClient, Transaction } from "./types.js"

const DAY_MS = 24 * 60 * 60 * 1_000

async function createContentFixture(
  tx: Transaction,
  environment: "production" | "dev"
) {
  const { organization, workflow, version } = await createTestFixtures(tx)
  const suffix = randomUUID()
  const configured = await configureTestEnvironment(tx, {
    applicationId: (
      await createApplication(tx, {
        workspaceId: organization.id,
        name: "Content",
        slug: suffix,
      })
    ).id,
    workspaceId: organization.id,
    environment,
    displayName: "Content",
    allowedBrowserOrigins: ["https://app.example.com"],
    allowedRedirectOrigins: ["https://app.example.com"],
    contentRetentionDays: 30,
    oidcIssuer: `https://identity-${suffix}.example.com`,
    oidcClientId: `content-${suffix}`,
    oidcAudience: "linea",
    oidcJwksUrl: `https://identity-${suffix}.example.com/jwks.json`,
  })
  const [actor] = await tx
    .insert(users)
    .values({ name: "Admin", email: `${suffix}@example.com` })
    .returning()
  const subjects = await tx
    .insert(externalSubjects)
    .values(
      ["erase-me", "keep-me"].map((issuerSubject) => ({
        workspaceId: organization.id,
        issuer: fixtureIssuer(configured),
        issuerSubject,
        status: "verified" as const,
        verifiedAt: new Date(),
      }))
    )
    .returning()
  await tx.insert(externalSubjectEnvironments).values(
    subjects.map((subject) => ({
      workspaceId: organization.id,
      environmentId: configured.id,
      externalSubjectId: subject.id,
    }))
  )
  async function seedContent(
    subjectId: string,
    input: {
      status: "queued" | "succeeded"
      createdAt: Date
      lastActivityAt: Date
    }
  ) {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        workspaceId: organization.id,
        environmentId: configured.id,
        workflowId: workflow.id,
        externalSubjectId: subjectId,
        title: "Private title",
        metadata: { ticket: "private-ticket" },
        environment,
        lastActivityAt: input.lastActivityAt,
        createdAt: input.createdAt,
      })
      .returning()
    const [question] = await tx
      .insert(chatMessages)
      .values({
        workspaceId: organization.id,
        conversationId: conversation.id,
        role: "user",
        content: "private question",
        createdAt: input.createdAt,
      })
      .returning()
    await tx.insert(chatMessages).values({
      workspaceId: organization.id,
      conversationId: conversation.id,
      role: "assistant",
      respondsToMessageId: question.id,
      content: "private answer",
      createdAt: input.lastActivityAt,
    })
    const [execution] = await tx
      .insert(executions)
      .values({
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        environmentId: configured.id,
        externalSubjectRecordId: subjectId,
        externalSubjectId: "erase-me-cleartext",
        conversationId: conversation.id,
        trigger: "api",
        environment,
        status: input.status,
        triggerPayload: { prompt: "private prompt" },
        output: input.status === "succeeded" ? { answer: "private" } : null,
        createdAt: input.createdAt,
      })
      .returning()
    await tx.insert(executionSteps).values({
      executionId: execution.id,
      workspaceId: organization.id,
      traceId: "trace",
      spanId: randomUUID(),
      name: "agent",
      startedAt: input.createdAt,
      nodeId: "agent",
      sequence: 0,
      input: { prompt: "private prompt" },
      output: { answer: "private" },
    })
    const [request] = await tx
      .insert(approvalRequests)
      .values({
        workspaceId: organization.id,
        environmentId: configured.id,
        workflowId: workflow.id,
        executionId: execution.id,
        nodeId: "approve",
        audience: "external_subject",
        externalSubjectId: subjectId,
        conversationId: conversation.id,
        status: input.status === "queued" ? "pending" : "decided",
        display: { title: "Private approval" },
        requestedAt: input.createdAt,
      })
      .returning()
    if (input.status === "succeeded")
      await tx.insert(approvalDecisions).values({
        workspaceId: organization.id,
        approvalRequestId: request.id,
        outcome: "approved",
        actorKind: "workspace_member",
        actorUserId: actor.id,
        reason: "human",
        comment: "private comment",
      })
    await tx.insert(outboxMessages).values({
      workspaceId: organization.id,
      environmentId: configured.id,
      externalSubjectId: subjectId,
      kind: "public_event",
      eventType: "approval_request.created",
      status: "published",
      publishedAt: input.createdAt,
      payload: {
        executionId: execution.id,
        display: { title: "Private approval" },
      },
      createdAt: input.createdAt,
    })
    await tx.insert(flags).values({
      workspaceId: organization.id,
      workflowId: workflow.id,
      executionId: execution.id,
      flagType: "retry_storm",
      dedupeKey: `retry_storm:${execution.id}`,
    })
    await tx.insert(publicIdempotencyRecords).values({
      workspaceId: organization.id,
      environmentId: configured.id,
      actorKind: "environment_key",
      actorId: randomUUID(),
      operation: "execution.start",
      idempotencyKey: randomUUID(),
      requestHash: "hash",
      resourceId: execution.id,
    })
    return { conversation, execution, request }
  }
  return {
    workspaceId: organization.id,
    workflowId: workflow.id,
    versionId: version.id,
    environment: configured,
    actor,
    erased: subjects[0],
    kept: subjects[1],
    seedContent,
  }
}

async function seedActionIntent(
  tx: DbClient,
  fixture: Awaited<ReturnType<typeof createContentFixture>>,
  executionId: string,
  status: "executing" | "succeeded"
) {
  const [connection] = await tx
    .insert(connections)
    .values({
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environment.id,
      externalSubjectId: fixture.erased.id,
      provider: "github",
      providerAccountId: randomUUID(),
      accountLabel: "Account",
      status: "active",
      scopes: ["repo"],
      credentialEncrypted: "credential",
    })
    .returning()
  const digest = "a".repeat(43)
  const [request] = await tx
    .insert(approvalRequests)
    .values({
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environment.id,
      workflowId: fixture.workflowId,
      executionId,
      nodeId: "connector",
      audience: "external_subject",
      externalSubjectId: fixture.erased.id,
      status: "decided",
      display: { title: "Private approval" },
      actionIntentDigest: digest,
    })
    .returning()
  const canonicalEnvelope = {
    version: 1,
    operationRevision: "1",
    connectionId: connection.id,
    connector: connection.provider,
    operation: "github.issue.create",
    target: { repository: "private/repository" },
    parameters: { body: "private" },
    providerPreconditions: {},
  } satisfies ActionIntentEnvelope
  const [intent] = await tx
    .insert(actionIntents)
    .values({
      workspaceId: fixture.workspaceId,
      environmentId: fixture.environment.id,
      externalSubjectId: fixture.erased.id,
      connectionId: connection.id,
      workflowId: fixture.workflowId,
      executionId,
      nodeId: "connector",
      approvalRequestId: request.id,
      connector: connection.provider,
      operationId: canonicalEnvelope.operation,
      operationRevision: canonicalEnvelope.operationRevision,
      target: canonicalEnvelope.target,
      normalizedParameters: canonicalEnvelope.parameters,
      providerPreconditions: canonicalEnvelope.providerPreconditions,
      safeDisplay: { title: "Private display" },
      digestVersion: "jcs-sha256-v1",
      canonicalDigest: digest,
      canonicalEnvelope,
      invocationIdempotencyKey: randomUUID(),
      status,
      executionClaimId: "claim",
      normalizedResult: status === "succeeded" ? { id: "private" } : null,
    })
    .returning()
  return intent
}

async function contentOf(tx: DbClient, conversationId: string) {
  return {
    conversations: await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId)),
    messages: await tx
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId)),
  }
}

describe("end-user content erasure", () => {
  it("removes a subject's conversations and execution content and leaves other subjects intact", async () => {
    await withRollback(async (tx) => {
      const fixture = await createContentFixture(tx, "production")
      const now = new Date()
      const erased = await fixture.seedContent(fixture.erased.id, {
        status: "queued",
        createdAt: now,
        lastActivityAt: now,
      })
      const finished = await fixture.seedContent(fixture.erased.id, {
        status: "succeeded",
        createdAt: now,
        lastActivityAt: now,
      })
      const kept = await fixture.seedContent(fixture.kept.id, {
        status: "succeeded",
        createdAt: now,
        lastActivityAt: now,
      })
      const intent = await seedActionIntent(
        tx,
        fixture,
        finished.execution.id,
        "succeeded"
      )
      const result = await eraseExternalSubject(
        tx,
        fixture.workspaceId,
        fixture.erased.id,
        fixture.actor.id
      )
      expect(result.outcome).toBe("erased")
      for (const seeded of [erased, finished]) {
        expect(await contentOf(tx, seeded.conversation.id)).toEqual({
          conversations: [],
          messages: [],
        })
      }
      const erasedExecutions = await tx
        .select()
        .from(executions)
        .where(
          inArray(executions.id, [erased.execution.id, finished.execution.id])
        )
      expect(erasedExecutions).toHaveLength(2)
      for (const execution of erasedExecutions) {
        expect(execution).toMatchObject({
          triggerPayload: null,
          output: null,
          externalSubjectId: null,
          conversationId: null,
        })
        expect(execution.contentErasedAt).not.toBeNull()
      }
      expect(
        erasedExecutions.find(({ id }) => id === erased.execution.id)?.status
      ).toBe("cancelled")
      expect(
        await tx
          .select()
          .from(executionSteps)
          .where(
            inArray(executionSteps.executionId, [
              erased.execution.id,
              finished.execution.id,
            ])
          )
      ).toEqual([])
      const requests = await tx
        .select()
        .from(approvalRequests)
        .where(
          inArray(approvalRequests.id, [erased.request.id, finished.request.id])
        )
      expect(requests.map(({ display }) => display)).toEqual([
        { title: "Content expired" },
        { title: "Content expired" },
      ])
      expect(requests.find(({ id }) => id === erased.request.id)?.status).toBe(
        "cancelled"
      )
      const [decision] = await tx
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, finished.request.id))
      expect(decision.comment).toBeNull()
      const [redactedIntent] = await tx
        .select()
        .from(actionIntents)
        .where(eq(actionIntents.id, intent.id))
      expect(redactedIntent).toMatchObject({
        target: { redacted: true },
        normalizedParameters: { redacted: true },
        normalizedResult: null,
      })
      const events = await tx
        .select()
        .from(outboxMessages)
        .where(eq(outboxMessages.eventType, "approval_request.created"))
      expect(
        events.filter(({ workspaceId }) => workspaceId === fixture.workspaceId)
      ).toHaveLength(1)
      expect(
        await tx
          .select()
          .from(flags)
          .where(eq(flags.workflowId, fixture.workflowId))
      ).toHaveLength(1)
      expect(
        await tx
          .select()
          .from(publicIdempotencyRecords)
          .where(
            eq(publicIdempotencyRecords.environmentId, fixture.environment.id)
          )
      ).toHaveLength(1)
      expect(
        await getPublicExecution(
          tx,
          fixture.workspaceId,
          fixture.environment.id,
          undefined,
          finished.execution.id
        )
      ).toBeUndefined()
      const retained = await contentOf(tx, kept.conversation.id)
      expect(retained.conversations).toHaveLength(1)
      expect(retained.messages).toHaveLength(2)
      const [keptExecution] = await tx
        .select()
        .from(executions)
        .where(eq(executions.id, kept.execution.id))
      expect(keptExecution).toMatchObject({
        triggerPayload: { prompt: "private prompt" },
        contentErasedAt: null,
      })
      const [keptDecision] = await tx
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, kept.request.id))
      expect(keptDecision.comment).toBe("private comment")
    })
  })
  it("refuses erasure while one of the subject's Action Intents is executing", async () => {
    await withRollback(async (tx) => {
      const fixture = await createContentFixture(tx, "production")
      const now = new Date()
      const seeded = await fixture.seedContent(fixture.erased.id, {
        status: "succeeded",
        createdAt: now,
        lastActivityAt: now,
      })
      await seedActionIntent(tx, fixture, seeded.execution.id, "executing")
      expect(
        await eraseExternalSubject(
          tx,
          fixture.workspaceId,
          fixture.erased.id,
          fixture.actor.id
        )
      ).toEqual({ outcome: "action_intent_executing" })
      const [subject] = await tx
        .select()
        .from(externalSubjects)
        .where(eq(externalSubjects.id, fixture.erased.id))
      expect(subject.status).toBe("verified")
      expect(
        (await contentOf(tx, seeded.conversation.id)).messages
      ).toHaveLength(2)
    })
  })
})

describe("end-user content retention", () => {
  it("expires production conversation content past the Environment window", async () => {
    await withRollback(async (tx) => {
      const fixture = await createContentFixture(tx, "production")
      const now = new Date()
      const old = new Date(now.getTime() - 31 * DAY_MS)
      const idle = await fixture.seedContent(fixture.erased.id, {
        status: "succeeded",
        createdAt: old,
        lastActivityAt: old,
      })
      const live = await fixture.seedContent(fixture.kept.id, {
        status: "succeeded",
        createdAt: old,
        lastActivityAt: now,
      })
      const running = await fixture.seedContent(fixture.kept.id, {
        status: "queued",
        createdAt: old,
        lastActivityAt: old,
      })
      await applyContentRetention(tx, now)
      expect(await contentOf(tx, idle.conversation.id)).toEqual({
        conversations: [],
        messages: [],
      })
      const liveContent = await contentOf(tx, live.conversation.id)
      expect(liveContent.conversations).toHaveLength(1)
      expect(liveContent.messages.map(({ content }) => content)).toEqual([
        "private answer",
      ])
      expect(liveContent.messages[0].respondsToMessageId).toBeNull()
      expect(
        (await contentOf(tx, running.conversation.id)).conversations
      ).toHaveLength(1)
      const requests = await tx
        .select()
        .from(approvalRequests)
        .where(
          inArray(approvalRequests.id, [
            idle.request.id,
            live.request.id,
            running.request.id,
          ])
        )
      expect(
        requests.find(({ id }) => id === idle.request.id)?.display
      ).toEqual({ title: "Content expired" })
      expect(
        requests.find(({ id }) => id === running.request.id)?.display
      ).toEqual({ title: "Private approval" })
      const [decision] = await tx
        .select()
        .from(approvalDecisions)
        .where(eq(approvalDecisions.approvalRequestId, live.request.id))
      expect(decision.comment).toBeNull()
      const [execution] = await tx
        .select()
        .from(executions)
        .where(eq(executions.id, idle.execution.id))
      expect(execution.conversationId).toBeNull()
    })
  })
  it("leaves development content to internal-development retention", async () => {
    await withRollback(async (tx) => {
      const fixture = await createContentFixture(tx, "dev")
      const old = new Date(Date.now() - 31 * DAY_MS)
      const seeded = await fixture.seedContent(fixture.erased.id, {
        status: "succeeded",
        createdAt: old,
        lastActivityAt: old,
      })
      await applyContentRetention(tx, new Date())
      const content = await contentOf(tx, seeded.conversation.id)
      expect(content.conversations).toHaveLength(1)
      expect(content.messages).toHaveLength(2)
      const [request] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, seeded.request.id))
      expect(request.display).toEqual({ title: "Private approval" })
    })
  })
})

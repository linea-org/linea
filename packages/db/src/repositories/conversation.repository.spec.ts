import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../clients/index.js"
import {
  applications,
  externalSubjectApplications,
  externalSubjects,
  organizations,
  type NewConversation,
  type NewExternalSubject,
} from "../schema/index.js"
import {
  createChatMessage,
  listExternalSubjectChatMessages,
} from "./chat-message.repository.js"
import {
  createConversation,
  getConversation,
  listConversations,
} from "./conversation.repository.js"
import { createWorkflow, createWorkflowVersion } from "./workflow.repository.js"

async function createConversationFixtures() {
  const suffix = randomUUID()
  const [workspace] = await db
    .insert(organizations)
    .values({
      name: "Conversation Test",
      slug: `conversation-test-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await createWorkflow(db, {
    workspaceId: workspace.id,
    name: "Conversation Workflow",
    slug: `conversation-workflow-${suffix}`,
  })
  await createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: suffix,
  })
  const [application] = await db
    .insert(applications)
    .values({
      workspaceId: workspace.id,
      environment: "production",
      displayName: "Customer application",
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "customer-application",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  const subjectValues: NewExternalSubject[] = ["subject-a", "subject-b"].map(
    (issuerSubject) => ({
      workspaceId: workspace.id,
      issuer: application.oidcIssuer,
      issuerSubject,
      status: "verified",
      verifiedAt: new Date(),
    })
  )
  const subjects = await db
    .insert(externalSubjects)
    .values(subjectValues)
    .returning()
  await db.insert(externalSubjectApplications).values(
    subjects.map((subject) => ({
      workspaceId: workspace.id,
      applicationId: application.id,
      externalSubjectId: subject.id,
    }))
  )
  return { workspace, workflow, application, subjects }
}

describe("conversation.repository", () => {
  it("keeps two conversations for one subject and their messages isolated", async () => {
    const fixtures = await createConversationFixtures()
    const identity: NewConversation = {
      workspaceId: fixtures.workspace.id,
      applicationId: fixtures.application.id,
      workflowId: fixtures.workflow.id,
      externalSubjectId: fixtures.subjects[0].id,
      environment: "production",
    }
    try {
      const first = await createConversation(db, {
        ...identity,
        title: "First prospect",
        metadata: { prospectId: "prospect-1" },
      })
      const second = await createConversation(db, {
        ...identity,
        title: "Second prospect",
        metadata: { prospectId: "prospect-2" },
      })
      if (first.outcome !== "created" || second.outcome !== "created") {
        throw new Error("Expected two Conversations")
      }
      await createChatMessage(db, {
        workspaceId: fixtures.workspace.id,
        conversationId: first.conversation.id,
        role: "user",
        content: "first history",
      })
      await createChatMessage(db, {
        workspaceId: fixtures.workspace.id,
        conversationId: second.conversation.id,
        role: "user",
        content: "second history",
      })
      const conversations = await listConversations(
        db,
        fixtures.workspace.id,
        fixtures.application.id,
        fixtures.subjects[0].id
      )
      expect(conversations).toHaveLength(2)
      expect(conversations.map((value) => value.title).sort()).toEqual([
        "First prospect",
        "Second prospect",
      ])
      const firstMessages = await listExternalSubjectChatMessages(
        db,
        fixtures.workspace.id,
        fixtures.application.id,
        fixtures.subjects[0].id,
        first.conversation.id
      )
      expect(firstMessages.map((message) => message.content)).toEqual([
        "first history",
      ])
      expect(
        await listExternalSubjectChatMessages(
          db,
          fixtures.workspace.id,
          fixtures.application.id,
          fixtures.subjects[1].id,
          first.conversation.id
        )
      ).toEqual([])
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, fixtures.workspace.id))
    }
  })

  it("returns the same external thread only for an identical identity", async () => {
    const fixtures = await createConversationFixtures()
    const input: NewConversation = {
      workspaceId: fixtures.workspace.id,
      applicationId: fixtures.application.id,
      workflowId: fixtures.workflow.id,
      externalSubjectId: fixtures.subjects[0].id,
      externalThreadKey: "operator-thread-42",
      environment: "production",
    }
    try {
      const created = await createConversation(db, input)
      const repeated = await createConversation(db, input)
      const wrongSubject = await createConversation(db, {
        ...input,
        externalSubjectId: fixtures.subjects[1].id,
      })
      const wrongEnvironment = await createConversation(db, {
        ...input,
        environment: "dev",
      })
      expect(created.outcome).toBe("created")
      expect(repeated.outcome).toBe("existing")
      expect(wrongSubject.outcome).toBe("conversation_identity_conflict")
      expect(wrongEnvironment.outcome).toBe("conversation_identity_conflict")
      const racingInput = { ...input, externalThreadKey: "racing-identity" }
      const racingResults = await Promise.all([
        createConversation(db, racingInput),
        createConversation(db, {
          ...racingInput,
          externalSubjectId: fixtures.subjects[1].id,
        }),
      ])
      expect(racingResults.map((result) => result.outcome).sort()).toEqual([
        "conversation_identity_conflict",
        "created",
      ])
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, fixtures.workspace.id))
    }
  })

  it("serializes concurrent creation of one external thread key", async () => {
    const fixtures = await createConversationFixtures()
    const input: NewConversation = {
      workspaceId: fixtures.workspace.id,
      applicationId: fixtures.application.id,
      workflowId: fixtures.workflow.id,
      externalSubjectId: fixtures.subjects[0].id,
      externalThreadKey: "concurrent-thread",
      environment: "production",
    }
    try {
      const results = await Promise.all([
        createConversation(db, input),
        createConversation(db, input),
      ])
      expect(results.map((result) => result.outcome).sort()).toEqual([
        "created",
        "existing",
      ])
      const ids = results.flatMap((result) =>
        result.outcome === "created" || result.outcome === "existing"
          ? [result.conversation.id]
          : []
      )
      expect(new Set(ids).size).toBe(1)
      const [conversationId] = ids
      if (!conversationId) throw new Error("Expected a Conversation")
      const conversation = await getConversation(
        db,
        fixtures.workspace.id,
        fixtures.application.id,
        fixtures.subjects[0].id,
        conversationId
      )
      expect(conversation).toBeDefined()
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, fixtures.workspace.id))
    }
  })
})

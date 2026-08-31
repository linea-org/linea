import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { chatMessages } from "../schema/index.js"
import type { Transaction } from "./types.js"
import {
  createConversationAnalysis,
  findConversationsDueForAnalysis,
  insertConversationFindings,
} from "./conversation-analysis.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import { updateWorkspaceSettings } from "./workspace-settings.repository.js"

async function insertMessage(
  tx: Transaction,
  input: {
    workspaceId: string
    workflowId: string
    conversationId: string
    createdAt: Date
    externalSubjectId?: string
  }
) {
  await tx.insert(chatMessages).values({
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    conversationId: input.conversationId,
    role: "user",
    content: "hello",
    externalSubjectId: input.externalSubjectId,
    createdAt: input.createdAt,
  })
}

describe("findConversationsDueForAnalysis", () => {
  it("excludes a workspace that has never enabled behaviour analysis", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        createdAt: new Date(Date.now() - 10 * 60_000),
      })

      const due = await findConversationsDueForAnalysis(tx, new Date())
      expect(due.map((d) => d.conversationId)).not.toContain(conversationId)
    })
  })

  it("excludes a conversation whose newest message is not yet idle", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
      })
      const conversationId = randomUUID()
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        createdAt: new Date(),
      })

      const due = await findConversationsDueForAnalysis(
        tx,
        new Date(Date.now() - 10 * 60_000)
      )
      expect(due.map((d) => d.conversationId)).not.toContain(conversationId)
    })
  })

  it("includes an idle, enabled, never-analyzed conversation, and excludes it once fully analyzed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
        behaviourSampleRate: 0.5,
      })
      const conversationId = randomUUID()
      const idleSince = new Date(Date.now() - 10 * 60_000)
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        createdAt: idleSince,
        externalSubjectId: "customer-user-1",
      })

      const beforeAnalysis = await findConversationsDueForAnalysis(
        tx,
        new Date()
      )
      const match = beforeAnalysis.find(
        (d) => d.conversationId === conversationId
      )
      expect(match).toBeDefined()
      expect(match?.externalSubjectId).toBe("customer-user-1")
      expect(match?.behaviourSampleRate).toBe(0.5)

      const analysis = await createConversationAnalysis(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        externalSubjectId: "customer-user-1",
        analyzedThroughSequence: match!.maxSequence,
        analyzerVersion: "v1",
      })
      await insertConversationFindings(tx, analysis.id, [
        {
          workspaceId: organization.id,
          axis: "user_experience",
          category: "satisfied",
          confidence: 0.9,
        },
      ])

      const afterAnalysis = await findConversationsDueForAnalysis(
        tx,
        new Date()
      )
      expect(afterAnalysis.map((d) => d.conversationId)).not.toContain(
        conversationId
      )
    })
  })

  it("re-includes a conversation once new messages push it past its last watermark", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
      })
      const conversationId = randomUUID()
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        createdAt: new Date(Date.now() - 20 * 60_000),
      })
      const [firstPass] = await findConversationsDueForAnalysis(tx, new Date())
      await createConversationAnalysis(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        analyzedThroughSequence: firstPass.maxSequence,
        analyzerVersion: "v1",
      })

      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        createdAt: new Date(Date.now() - 10 * 60_000),
      })

      const due = await findConversationsDueForAnalysis(tx, new Date())
      const match = due.find((d) => d.conversationId === conversationId)
      expect(match).toBeDefined()
      expect(match!.maxSequence).toBeGreaterThan(firstPass.maxSequence)
    })
  })

  it("breaks a created_at tie between two analysis rows by picking the higher watermark, not an arbitrary one", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
      })
      const conversationId = randomUUID()
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        createdAt: new Date(Date.now() - 20 * 60_000),
      })
      const [due] = await findConversationsDueForAnalysis(tx, new Date())

      // Two analysis rows sharing the exact same created_at — as if two concurrent runs both
      // wrote one. Inserted lower-watermark-first so a plain DISTINCT ON with no tiebreaker
      // could arbitrarily keep either row.
      const tiedTimestamp = new Date()
      await createConversationAnalysis(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        analyzedThroughSequence: 1,
        analyzerVersion: "v1",
        createdAt: tiedTimestamp,
      })
      await createConversationAnalysis(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        analyzedThroughSequence: due.maxSequence,
        analyzerVersion: "v1",
        createdAt: tiedTimestamp,
      })

      // If the tie picked the watermark=1 row, this conversation would incorrectly still be due.
      const afterAnalysis = await findConversationsDueForAnalysis(
        tx,
        new Date()
      )
      expect(afterAnalysis.map((d) => d.conversationId)).not.toContain(
        conversationId
      )
    })
  })
})

import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { chatMessages } from "../schema/index.js"
import type { Transaction } from "./types.js"
import {
  claimConversationForAnalysis,
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

describe("claimConversationForAnalysis", () => {
  it("claims once, then reports already-claimed for a second attempt within the lease window", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()
      const input = {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
      }

      const first = await claimConversationForAnalysis(tx, input, 60_000)
      expect(first).toEqual({ outcome: "claimed", attemptCount: 1 })

      const second = await claimConversationForAnalysis(tx, input, 60_000)
      expect(second).toEqual({ outcome: "already-claimed" })
    })
  })

  it("re-claims once the previous claim's lease has expired, incrementing attemptCount", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()
      const input = {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
      }

      // A lease of 0ms is immediately stale, standing in for "the previous claim expired" without
      // an actual sleep.
      const first = await claimConversationForAnalysis(tx, input, 0)
      expect(first).toEqual({ outcome: "claimed", attemptCount: 1 })

      const second = await claimConversationForAnalysis(tx, input, 0)
      expect(second).toEqual({ outcome: "claimed", attemptCount: 2 })
    })
  })

  it("claims for different conversations independently", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)

      const a = await claimConversationForAnalysis(
        tx,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: randomUUID(),
        },
        60_000
      )
      const b = await claimConversationForAnalysis(
        tx,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: randomUUID(),
        },
        60_000
      )
      expect(a).toEqual({ outcome: "claimed", attemptCount: 1 })
      expect(b).toEqual({ outcome: "claimed", attemptCount: 1 })
    })
  })
})

describe("findConversationsDueForAnalysis", () => {
  it("excludes a conversation with an active claim, and includes it again once the claim lease expires", async () => {
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

      const claimed = await claimConversationForAnalysis(
        tx,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
        },
        60_000
      )
      expect(claimed.outcome).toBe("claimed")

      const dueWhileClaimed = await findConversationsDueForAnalysis(
        tx,
        new Date(),
        20,
        60_000
      )
      expect(dueWhileClaimed.map((d) => d.conversationId)).not.toContain(
        conversationId
      )

      // A claimLeaseMs of 0 treats even a just-made claim as stale.
      const dueWithExpiredLease = await findConversationsDueForAnalysis(
        tx,
        new Date(),
        20,
        0
      )
      expect(dueWithExpiredLease.map((d) => d.conversationId)).toContain(
        conversationId
      )
    })
  })

  it("orders a never-claimed conversation ahead of one that keeps getting reclaimed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
      })
      const idleSince = new Date(Date.now() - 20 * 60_000)
      const repeatedlyFailingId = randomUUID()
      const neverTriedId = randomUUID()
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: repeatedlyFailingId,
        createdAt: idleSince,
      })
      await insertMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: neverTriedId,
        createdAt: idleSince,
      })

      // Claimed and immediately expired (lease 0), simulating a conversation that's already
      // failed once — its claimed_at is more recent than the never-tried conversation's (which
      // has none at all), so it should sort behind, not in front.
      await claimConversationForAnalysis(
        tx,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: repeatedlyFailingId,
        },
        0
      )

      const due = await findConversationsDueForAnalysis(tx, new Date(), 20, 0)
      const ids = due.map((d) => d.conversationId)
      expect(ids.indexOf(neverTriedId)).toBeLessThan(
        ids.indexOf(repeatedlyFailingId)
      )
    })
  })

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

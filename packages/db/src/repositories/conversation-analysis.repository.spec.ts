import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { Transaction } from "./types.js"
import { createBuilderChatMessage } from "./chat-message.repository.js"
import { ensureBuilderConversation } from "./conversation.repository.js"
import {
  claimConversationForAnalysis,
  createConversationAnalysis,
  findConversationsDueForAnalysis,
  insertConversationFindings,
  renewClaimIfOwned,
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
  await createBuilderChatMessage(tx, {
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
      await ensureBuilderConversation(tx, {
        id: conversationId,
        workspaceId: organization.id,
        workflowId: workflow.id,
        externalSubjectKey: null,
      })

      const first = await claimConversationForAnalysis(tx, input, 60_000)
      if (first.outcome !== "claimed") throw new Error("expected claimed")
      expect(first.attemptCount).toBe(1)
      expect(first.claimedAt).toBeInstanceOf(Date)

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
      await ensureBuilderConversation(tx, {
        id: conversationId,
        workspaceId: organization.id,
        workflowId: workflow.id,
        externalSubjectKey: null,
      })

      // A lease of 0ms is immediately stale, standing in for "the previous claim expired" without
      // an actual sleep.
      const first = await claimConversationForAnalysis(tx, input, 0)
      if (first.outcome !== "claimed") throw new Error("expected claimed")
      expect(first.attemptCount).toBe(1)

      const second = await claimConversationForAnalysis(tx, input, 0)
      if (second.outcome !== "claimed") throw new Error("expected claimed")
      expect(second.attemptCount).toBe(2)
    })
  })

  it("claims for different conversations independently", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationA = randomUUID()
      const conversationB = randomUUID()
      await ensureBuilderConversation(tx, {
        id: conversationA,
        workspaceId: organization.id,
        workflowId: workflow.id,
        externalSubjectKey: null,
      })
      await ensureBuilderConversation(tx, {
        id: conversationB,
        workspaceId: organization.id,
        workflowId: workflow.id,
        externalSubjectKey: null,
      })

      const a = await claimConversationForAnalysis(
        tx,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: conversationA,
        },
        60_000
      )
      const b = await claimConversationForAnalysis(
        tx,
        {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: conversationB,
        },
        60_000
      )
      if (a.outcome !== "claimed") throw new Error("expected claimed")
      if (b.outcome !== "claimed") throw new Error("expected claimed")
      expect(a.attemptCount).toBe(1)
      expect(b.attemptCount).toBe(1)
    })
  })
})

describe("renewClaimIfOwned", () => {
  it("returns true and refreshes claimed_at when the fencing token still matches", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const input = {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: randomUUID(),
      }
      await ensureBuilderConversation(tx, {
        id: input.conversationId,
        workspaceId: organization.id,
        workflowId: workflow.id,
        externalSubjectKey: null,
      })
      const claim = await claimConversationForAnalysis(tx, input, 60_000)
      if (claim.outcome !== "claimed") throw new Error("expected claimed")

      const owned = await renewClaimIfOwned(tx, input, claim.attemptCount)
      expect(owned).toBe(true)
    })
  })

  it("returns false when another worker has reclaimed since, without touching that reclaim", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const input = {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: randomUUID(),
      }
      await ensureBuilderConversation(tx, {
        id: input.conversationId,
        workspaceId: organization.id,
        workflowId: workflow.id,
        externalSubjectKey: null,
      })
      const first = await claimConversationForAnalysis(tx, input, 0)
      if (first.outcome !== "claimed") throw new Error("expected claimed")

      // Lease of 0 makes it immediately stale, standing in for the first worker's claim expiring
      // while its (unbounded) provider call was still in flight.
      const second = await claimConversationForAnalysis(tx, input, 0)
      if (second.outcome !== "claimed") throw new Error("expected reclaimed")
      expect(second.attemptCount).toBe(first.attemptCount + 1)
      const owned = await renewClaimIfOwned(tx, input, first.attemptCount)
      expect(owned).toBe(false)
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

  it("does not overflow on a sequence value beyond int32, which max(sequence)::int used to truncate", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      await updateWorkspaceSettings(tx, organization.id, {
        behaviourAnalysisEnabled: true,
      })
      const conversationId = randomUUID()
      // Postgres int32 tops out at 2,147,483,647 — chat_messages.sequence is a shared bigserial
      // across every conversation in the database, so a busy deployment reaches this eventually.
      const beyondInt32 = 3_000_000_000
      await createBuilderChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "hello",
        createdAt: new Date(Date.now() - 20 * 60_000),
        sequence: beyondInt32,
      })

      const due = await findConversationsDueForAnalysis(tx, new Date())
      const match = due.find((d) => d.conversationId === conversationId)
      expect(match?.maxSequence).toBe(beyondInt32)
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
      expect(match?.externalSubjectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
      expect(match?.behaviourSampleRate).toBe(0.5)

      const analysis = await createConversationAnalysis(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        externalSubjectId: match?.externalSubjectId,
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

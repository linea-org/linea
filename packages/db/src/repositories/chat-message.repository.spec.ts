import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  createChatMessage,
  deleteOrphanedChatMessages,
  listChatMessages,
  listConversations,
} from "./chat-message.repository.js"
import { createExecution, failQueuedExecution } from "./execution.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("chat-message.repository", () => {
  it("lists messages for a conversation ordered oldest first", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()

      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "hello",
      })
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "assistant",
        content: "hi there",
      })

      const messages = await listChatMessages(
        tx,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({ role: "user", content: "hello" })
      expect(messages[1]).toMatchObject({
        role: "assistant",
        content: "hi there",
      })
    })
  })

  it("orders assistant replies by their own turn, not by which execution's AI call finished first", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()
      const now = Date.now()

      const user1 = await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "first turn",
        createdAt: new Date(now),
      })
      const user2 = await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "second turn",
        createdAt: new Date(now + 1_000),
      })
      // Turn 2's execution finishes first in wall-clock time, even though turn 1 was submitted first.
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "assistant",
        content: "second reply",
        respondsToMessageId: user2.id,
        createdAt: new Date(now + 2_000),
      })
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "assistant",
        content: "first reply",
        respondsToMessageId: user1.id,
        createdAt: new Date(now + 3_000),
      })

      const messages = await listChatMessages(
        tx,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages.map((m) => m.content)).toEqual([
        "first turn",
        "first reply",
        "second turn",
        "second reply",
      ])
    })
  })

  it("orders correctly even when two user turns share the exact same createdAt timestamp", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationId = randomUUID()
      // Same timestamp for both user turns — only correct if something besides createdAt orders them.
      const tiedTimestamp = new Date()

      const user1 = await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "first turn",
        createdAt: tiedTimestamp,
      })
      const user2 = await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "second turn",
        createdAt: tiedTimestamp,
      })
      // Turn 2's reply persisted first, but there's no timestamp gap here for coalesce() to fall back on.
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "assistant",
        content: "second reply",
        respondsToMessageId: user2.id,
        createdAt: tiedTimestamp,
      })
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "assistant",
        content: "first reply",
        respondsToMessageId: user1.id,
        createdAt: tiedTimestamp,
      })

      const messages = await listChatMessages(
        tx,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages.map((m) => m.content)).toEqual([
        "first turn",
        "first reply",
        "second turn",
        "second reply",
      ])
    })
  })

  it("scopes by workspaceId, excluding another workspace's conversation of the same id", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const otherOrg = await createTestFixtures(tx)
      const conversationId = randomUUID()

      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "in scope",
      })
      await createChatMessage(tx, {
        workspaceId: otherOrg.organization.id,
        workflowId: otherOrg.workflow.id,
        conversationId,
        role: "user",
        content: "different workspace",
      })

      const messages = await listChatMessages(
        tx,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("in scope")
    })
  })

  it("scopes by workflowId, excluding another workflow's conversation of the same id in the same workspace", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const otherWorkflow = await createTestFixtures(tx)
      const conversationId = randomUUID()

      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "workflow A's turn",
      })
      // Same workspace as `organization`, different workflow, reusing the same conversationId -
      // must not be visible when scoped to `workflow`.
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: otherWorkflow.workflow.id,
        conversationId,
        role: "user",
        content: "workflow B's turn",
      })

      const messages = await listChatMessages(
        tx,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("workflow A's turn")
    })
  })

  it("does not mix messages across different conversations in the same workflow", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const conversationA = randomUUID()
      const conversationB = randomUUID()

      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: conversationA,
        role: "user",
        content: "conversation A",
      })
      await createChatMessage(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId: conversationB,
        role: "user",
        content: "conversation B",
      })

      const messages = await listChatMessages(
        tx,
        organization.id,
        workflow.id,
        conversationA
      )
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("conversation A")
    })
  })

  describe("listConversations", () => {
    it("groups by conversation, using the first message as preview, ordered most-recent-first", async () => {
      await withRollback(async (tx) => {
        const { organization, workflow } = await createTestFixtures(tx)
        const older = randomUUID()
        const newer = randomUUID()

        await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: older,
          role: "user",
          content: "older conversation opener",
          createdAt: new Date(Date.now() - 60_000),
        })
        await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: older,
          role: "assistant",
          content: "older conversation reply",
          createdAt: new Date(Date.now() - 50_000),
        })
        await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: newer,
          role: "user",
          content: "newer conversation opener",
          createdAt: new Date(),
        })

        const conversations = await listConversations(
          tx,
          organization.id,
          workflow.id
        )
        expect(conversations).toHaveLength(2)
        expect(conversations[0]).toMatchObject({
          conversationId: newer,
          preview: "newer conversation opener",
          messageCount: 1,
        })
        expect(conversations[1]).toMatchObject({
          conversationId: older,
          preview: "older conversation opener",
          messageCount: 2,
        })
      })
    })

    it("scopes by workspaceId and workflowId", async () => {
      await withRollback(async (tx) => {
        const { organization, workflow } = await createTestFixtures(tx)
        const otherOrg = await createTestFixtures(tx)

        await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId: randomUUID(),
          role: "user",
          content: "in scope",
        })
        await createChatMessage(tx, {
          workspaceId: otherOrg.organization.id,
          workflowId: otherOrg.workflow.id,
          conversationId: randomUUID(),
          role: "user",
          content: "different workspace",
        })

        const conversations = await listConversations(
          tx,
          organization.id,
          workflow.id
        )
        expect(conversations).toHaveLength(1)
        expect(conversations[0].preview).toBe("in scope")
      })
    })
  })

  describe("deleteOrphanedChatMessages", () => {
    it("deletes a user turn whose triggering execution failed and was never answered", async () => {
      await withRollback(async (tx) => {
        const { organization, workflow, version } = await createTestFixtures(tx)
        const conversationId = randomUUID()
        const message = await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "hello",
          createdAt: new Date(Date.now() - 120_000),
        })
        const execution = await createExecution(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          triggerPayload: { conversationId, chatMessageId: message.id },
        })
        await failQueuedExecution(tx, execution.id, { message: "boom" })

        const deleted = await deleteOrphanedChatMessages(
          tx,
          new Date(Date.now() - 60_000)
        )
        expect(deleted).toBe(1)

        const remaining = await listChatMessages(
          tx,
          organization.id,
          workflow.id,
          conversationId
        )
        expect(remaining).toHaveLength(0)
      })
    })

    it("does not delete a user turn that already has a reply", async () => {
      await withRollback(async (tx) => {
        const { organization, workflow, version } = await createTestFixtures(tx)
        const conversationId = randomUUID()
        const message = await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "hello",
          createdAt: new Date(Date.now() - 120_000),
        })
        const execution = await createExecution(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          triggerPayload: { conversationId, chatMessageId: message.id },
        })
        await failQueuedExecution(tx, execution.id, { message: "boom" })
        await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "assistant",
          content: "a reply arrived anyway",
          respondsToMessageId: message.id,
        })

        const deleted = await deleteOrphanedChatMessages(
          tx,
          new Date(Date.now() - 60_000)
        )
        expect(deleted).toBe(0)
      })
    })

    it("does not delete a user turn whose execution hasn't failed yet", async () => {
      await withRollback(async (tx) => {
        const { organization, workflow, version } = await createTestFixtures(tx)
        const conversationId = randomUUID()
        const message = await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "hello",
          createdAt: new Date(Date.now() - 120_000),
        })
        await createExecution(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          triggerPayload: { conversationId, chatMessageId: message.id },
        })

        const deleted = await deleteOrphanedChatMessages(
          tx,
          new Date(Date.now() - 60_000)
        )
        expect(deleted).toBe(0)
      })
    })

    it("does not delete a turn newer than the cutoff, even if its execution already failed", async () => {
      await withRollback(async (tx) => {
        const { organization, workflow, version } = await createTestFixtures(tx)
        const conversationId = randomUUID()
        const message = await createChatMessage(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          conversationId,
          role: "user",
          content: "hello",
        })
        const execution = await createExecution(tx, {
          workspaceId: organization.id,
          workflowId: workflow.id,
          workflowVersionId: version.id,
          trigger: "manual",
          triggerPayload: { conversationId, chatMessageId: message.id },
        })
        await failQueuedExecution(tx, execution.id, { message: "boom" })

        const deleted = await deleteOrphanedChatMessages(
          tx,
          new Date(Date.now() - 60_000)
        )
        expect(deleted).toBe(0)
      })
    })
  })
})

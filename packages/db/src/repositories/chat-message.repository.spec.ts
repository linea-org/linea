import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  createChatMessage,
  listChatMessages,
} from "./chat-message.repository.js"
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
        conversationId
      )
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("in scope")
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
        conversationA
      )
      expect(messages).toHaveLength(1)
      expect(messages[0].content).toBe("conversation A")
    })
  })
})

import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { ChatMessageSweepService } from "./chat-message-sweep.service"

afterAll(async () => {
  await pool.end()
})

const graph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "n1",
  nodes: [{ id: "n1", type: "transform", config: {} }],
  edges: [],
}

describe("ChatMessageSweepService", () => {
  it("deletes a user turn whose triggering execution failed and was never answered", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Chat Sweep Org",
        slug: `chat-sweep-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Chat Sweep Workflow",
        slug: `chat-sweep-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "test-hash",
      })
      const conversationId = randomUUID()
      const message = await repositories.chatMessage.createChatMessage(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        conversationId,
        role: "user",
        content: "hello",
        createdAt: new Date(Date.now() - 600_000),
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: { conversationId, chatMessageId: message.id },
      })
      await repositories.execution.failQueuedExecution(db, execution.id, {
        message: "boom",
      })

      const service = new ChatMessageSweepService()
      await service.sweep()

      const remaining = await repositories.chatMessage.listChatMessages(
        db,
        organization.id,
        workflow.id,
        conversationId
      )
      expect(remaining).toHaveLength(0)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})

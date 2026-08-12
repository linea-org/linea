import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { TranscriptFlaggersService } from "./transcript-flaggers.service"

afterAll(async () => {
  await pool.end()
})

describe("TranscriptFlaggersService.sweep", () => {
  it("flags a failed tool step and a refusal, ignores a clean succeeded step", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Transcript Flaggers Test Org",
        slug: `transcript-flaggers-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Transcript Flaggers Test Workflow",
        slug: `transcript-flaggers-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: `transcript-flaggers-hash-${suffix}`,
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })

      await db.insert(schema.executionSteps).values([
        {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "http-span",
          name: "http",
          nodeId: "http-step",
          sequence: 1,
          startedAt: new Date(),
          status: "failed",
        },
        {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "refusal-span",
          name: "ai",
          nodeId: "ai-step",
          sequence: 2,
          startedAt: new Date(),
          status: "succeeded",
          output: { text: "I cannot help with that." },
        },
        {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "clean-span",
          name: "ai",
          nodeId: "ai-step-2",
          sequence: 3,
          startedAt: new Date(),
          status: "succeeded",
          output: { text: "Here's the answer you asked for." },
        },
      ])

      const service = new TranscriptFlaggersService()
      await service.sweep()

      const allFlags = await db.select().from(schema.flags)
      const executionFlags = allFlags.filter(
        (f) => f.executionId === execution.id
      )
      const flagTypes = executionFlags.map((f) => f.flagType).sort()

      expect(flagTypes).toEqual(["refusal", "tool_error"])
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})

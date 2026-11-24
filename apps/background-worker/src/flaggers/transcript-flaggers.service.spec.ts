import { createTestExecution } from "@linealabs/db/testing"
import { getTestApplicationId } from "@linealabs/db/testing"
import "dotenv/config"
import { randomUUID } from "node:crypto"
import { Logger } from "@nestjs/common"
import { db, pool, repositories, schema } from "@linealabs/db"
import {
  createFlaggerWorkspace,
  deleteFlaggerWorkspace,
} from "./flagger-workspace.fixture"
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
        applicationId: await getTestApplicationId(db, organization.id),
        workspaceId: organization.id,
        name: "Transcript Flaggers Test Workflow",
        slug: `transcript-flaggers-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: `transcript-flaggers-hash-${suffix}`,
      })
      const execution = await createTestExecution(db, {
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
  it("persists one repeated_replay flag per original step, even as the replay count keeps growing", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Transcript Flaggers Escalation Test Org",
        slug: `transcript-flaggers-escalation-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        applicationId: await getTestApplicationId(db, organization.id),
        workspaceId: organization.id,
        name: "Transcript Flaggers Escalation Test Workflow",
        slug: `transcript-flaggers-escalation-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: `transcript-flaggers-escalation-hash-${suffix}`,
      })
      const execution = await createTestExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })
      const [original] = await db
        .insert(schema.executionSteps)
        .values({
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "original-span",
          name: "ai",
          nodeId: "n1",
          sequence: 1,
          startedAt: new Date(),
          status: "succeeded",
          output: { text: "hello" },
        })
        .returning()
      async function insertReplay() {
        await db.insert(schema.executionSteps).values({
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: randomUUID(),
          name: "ai",
          nodeId: "n1",
          sequence: 1,
          startedAt: new Date(),
          status: "succeeded",
          output: { text: "hello" },
          replayedFromStepId: original.id,
        })
      }
      const service = new TranscriptFlaggersService()
      // First sweep: 3 replays, crosses the threshold.
      await insertReplay()
      await insertReplay()
      await insertReplay()
      await service.sweep()
      // Second sweep: the count has grown — must not create a second flag for the same step.
      await insertReplay()
      await service.sweep()
      const allFlags = await db.select().from(schema.flags)
      const repeatedReplayFlags = allFlags.filter(
        (f) =>
          f.executionId === execution.id && f.flagType === "repeated_replay"
      )
      expect(repeatedReplayFlags).toHaveLength(1)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
  it("still flags other workspaces when one is deleted mid-sweep", async () => {
    const doomed = await createFlaggerWorkspace("Deleted Mid Sweep")
    const survivor = await createFlaggerWorkspace("Survivor")
    const errorLog = jest.spyOn(Logger.prototype, "error").mockImplementation()
    try {
      const [doomedStep] = await db
        .insert(schema.executionSteps)
        .values({
          executionId: doomed.execution.id,
          workspaceId: doomed.organization.id,
          traceId: doomed.execution.id,
          startedAt: new Date(),
          spanId: "http-span",
          name: "http",
          nodeId: "n1",
          sequence: 1,
          status: "failed",
        })
        .returning()
      await db.insert(schema.executionSteps).values({
        executionId: survivor.execution.id,
        workspaceId: survivor.organization.id,
        traceId: survivor.execution.id,
        startedAt: new Date(),
        spanId: "refusal-span",
        name: "ai",
        nodeId: "ai-step",
        sequence: 1,
        status: "succeeded",
        output: { text: "I cannot help with that." },
      })
      jest.spyOn(db, "transaction").mockImplementationOnce(async (run) => {
        await deleteFlaggerWorkspace(doomed.organization.id)
        return db.transaction(run)
      })

      await new TranscriptFlaggersService().sweep()

      const allFlags = await db.select().from(schema.flags)
      const flags = allFlags.filter(
        (f) =>
          f.executionId === doomed.execution.id ||
          f.executionId === survivor.execution.id
      )
      expect(flags.map((f) => [f.executionId, f.flagType])).toEqual([
        [survivor.execution.id, "refusal"],
      ])
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `tool_error:${doomedStep.id}.*signals_workspace_id_organizations_id_fkey`
          )
        )
      )
    } finally {
      jest.restoreAllMocks()
      await deleteFlaggerWorkspace(doomed.organization.id)
      await deleteFlaggerWorkspace(survivor.organization.id)
    }
  })
})

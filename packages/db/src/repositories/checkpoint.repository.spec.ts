import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { executionSteps } from "../schema/index.js"
import {
  createExecution,
  getExecutionWithSteps,
  startExecution,
} from "./execution.repository.js"
import {
  getLatestCheckpoint,
  getStepsForExecution,
  RESUME_EVENT_NODE_ID,
  recordResumeEvent,
  writeStepAndCheckpoint,
} from "./checkpoint.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

describe("writeStepAndCheckpoint", () => {
  it("writes the step and the checkpoint together", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const result = await writeStepAndCheckpoint(tx, {
        leasedBy: "worker-1",
        step: {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-1",
          name: "http",
          startedAt: new Date(),
          status: "succeeded",
          nodeId: "node-1",
          sequence: 1,
        },
        checkpoint: {
          sequence: 1,
          completedStepIds: ["node-1"],
          context: { "node-1": { status: 200 } },
        },
      })

      expect(result?.step.executionId).toBe(execution.id)
      expect(result?.checkpoint.executionId).toBe(execution.id)

      const latest = await getLatestCheckpoint(tx, execution.id)
      expect(latest?.sequence).toBe(1)

      const steps = await getStepsForExecution(tx, execution.id)
      expect(steps).toHaveLength(1)
      expect(steps[0].nodeId).toBe("node-1")
    })
  })

  it("returns the most recent checkpoint when several exist", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      for (const sequence of [1, 2, 3]) {
        await writeStepAndCheckpoint(tx, {
          leasedBy: "worker-1",
          step: {
            executionId: execution.id,
            workspaceId: organization.id,
            traceId: execution.id,
            spanId: `span-${sequence}`,
            name: "http",
            startedAt: new Date(),
            status: "succeeded",
            nodeId: `node-${sequence}`,
            sequence,
          },
          checkpoint: {
            sequence,
            completedStepIds: [`node-${sequence}`],
            context: {},
          },
        })
      }

      const latest = await getLatestCheckpoint(tx, execution.id)
      expect(latest?.sequence).toBe(3)
    })
  })

  it("rejects a step whose workspaceId does not match its execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )
      const { organization: otherOrg } = await createTestFixtures(tx)

      await expect(
        writeStepAndCheckpoint(tx, {
          leasedBy: "worker-1",
          step: {
            executionId: execution.id,
            workspaceId: otherOrg.id,
            traceId: execution.id,
            spanId: "span-1",
            name: "http",
            startedAt: new Date(),
            status: "succeeded",
            nodeId: "node-1",
            sequence: 1,
          },
          checkpoint: { sequence: 1, completedStepIds: [], context: {} },
        })
      ).rejects.toThrow()
    })
  })

  it("does not write a step for a worker that lost the lease to a reclaim", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
      )
      await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      // worker-1 was still mid-step when worker-2 reclaimed the execution.
      const result = await writeStepAndCheckpoint(tx, {
        leasedBy: "worker-1",
        step: {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-1",
          name: "http",
          startedAt: new Date(),
          status: "succeeded",
          nodeId: "node-1",
          sequence: 1,
        },
        checkpoint: { sequence: 1, completedStepIds: ["node-1"], context: {} },
      })

      expect(result).toBeUndefined()

      const steps = await getStepsForExecution(tx, execution.id)
      expect(steps).toHaveLength(0)
      const latest = await getLatestCheckpoint(tx, execution.id)
      expect(latest).toBeUndefined()
    })
  })

  it("does not write a step once the lease has expired, even if nobody has reclaimed it yet", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() - 1_000)
      )

      // Same worker, same identity — but its own lease already lapsed.
      const result = await writeStepAndCheckpoint(tx, {
        leasedBy: "worker-1",
        step: {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-1",
          name: "http",
          startedAt: new Date(),
          status: "succeeded",
          nodeId: "node-1",
          sequence: 1,
        },
        checkpoint: { sequence: 1, completedStepIds: ["node-1"], context: {} },
      })

      expect(result).toBeUndefined()
    })
  })
})

describe("recordResumeEvent", () => {
  it("records a resume event with the sentinel nodeId and a negative sequence", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const event = await recordResumeEvent(
        tx,
        execution.id,
        organization.id,
        "worker-1"
      )

      expect(event?.nodeId).toBe(RESUME_EVENT_NODE_ID)
      expect(event?.sequence).toBeLessThan(0)
      expect(event?.status).toBe("succeeded")
    })
  })

  it("assigns a distinct sequence to each successive resume for the same execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const first = await recordResumeEvent(
        tx,
        execution.id,
        organization.id,
        "worker-1"
      )
      const second = await recordResumeEvent(
        tx,
        execution.id,
        organization.id,
        "worker-1"
      )

      expect(first?.sequence).not.toBe(second?.sequence)
      const events = await getStepsForExecution(tx, execution.id)
      expect(
        events.filter((e) => e.nodeId === RESUME_EVENT_NODE_ID)
      ).toHaveLength(2)
    })
  })

  it("returns undefined for a worker whose lease has already been reclaimed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1-doomed",
        new Date(Date.now() - 1_000)
      )
      await startExecution(
        tx,
        execution.id,
        "worker-2",
        new Date(Date.now() + 60_000)
      )

      const event = await recordResumeEvent(
        tx,
        execution.id,
        organization.id,
        "worker-1-doomed"
      )

      expect(event).toBeUndefined()
      const steps = await getStepsForExecution(tx, execution.id)
      expect(steps).toHaveLength(0)
    })
  })

  it("returns undefined for an execution that was never claimed", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const event = await recordResumeEvent(
        tx,
        execution.id,
        organization.id,
        "worker-1"
      )

      expect(event).toBeUndefined()
    })
  })

  it("sorts chronologically among real steps when fetched via getExecutionWithSteps, not by sequence", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(
        tx,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const t0 = new Date("2026-01-01T00:00:00.000Z")
      const t1 = new Date("2026-01-01T00:01:00.000Z")
      const t2 = new Date("2026-01-01T00:02:00.000Z")

      await writeStepAndCheckpoint(tx, {
        leasedBy: "worker-1",
        step: {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-1",
          name: "http",
          startedAt: t0,
          endedAt: t0,
          status: "succeeded",
          nodeId: "node-1",
          sequence: 0,
        },
        checkpoint: { sequence: 0, completedStepIds: ["node-1"], context: {} },
      })

      // Positive sequence (0) would sort a naive sequence-ordered query before
      // this negative-sequence resume event, even though it happened after —
      // proving the ordering fix, not just the insert, is what's under test.
      const resumeEvent = await recordResumeEvent(
        tx,
        execution.id,
        organization.id,
        "worker-1"
      )
      if (!resumeEvent) throw new Error("expected a resume event")
      await tx
        .update(executionSteps)
        .set({ startedAt: t1, endedAt: t1 })
        .where(eq(executionSteps.id, resumeEvent.id))

      await writeStepAndCheckpoint(tx, {
        leasedBy: "worker-1",
        step: {
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-2",
          name: "transform",
          startedAt: t2,
          endedAt: t2,
          status: "succeeded",
          nodeId: "node-2",
          sequence: 1,
        },
        checkpoint: {
          sequence: 1,
          completedStepIds: ["node-1", "node-2"],
          context: {},
        },
      })

      const result = await getExecutionWithSteps(tx, execution.id)
      expect(result?.steps.map((s) => s.nodeId)).toEqual([
        "node-1",
        RESUME_EVENT_NODE_ID,
        "node-2",
      ])
    })
  })

  it("breaks a startedAt tie by insertion order via createdAt", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const sameInstant = new Date("2026-01-01T00:00:00.000Z")
      const [first] = await tx
        .insert(executionSteps)
        .values({
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-1",
          name: "transform",
          startedAt: sameInstant,
          endedAt: sameInstant,
          status: "succeeded",
          nodeId: "node-1",
          sequence: 0,
        })
        .returning()
      const [second] = await tx
        .insert(executionSteps)
        .values({
          executionId: execution.id,
          workspaceId: organization.id,
          traceId: execution.id,
          spanId: "span-2",
          name: "transform",
          startedAt: sameInstant,
          endedAt: sameInstant,
          status: "succeeded",
          nodeId: "node-2",
          sequence: 1,
        })
        .returning()

      // Same startedAt on both — only distinct createdAt (insertion order) can break the tie.
      expect(first.startedAt.getTime()).toBe(second.startedAt.getTime())

      const result = await getExecutionWithSteps(tx, execution.id)
      expect(result?.steps.map((s) => s.nodeId)).toEqual(["node-1", "node-2"])
    })
  })
})

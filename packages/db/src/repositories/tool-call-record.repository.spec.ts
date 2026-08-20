import { describe, expect, it } from "vitest"
import { createExecution, startExecution } from "./execution.repository.js"
import {
  getToolCallRecord,
  recordToolCall,
} from "./tool-call-record.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

const farFuture = new Date(Date.now() + 60 * 60 * 1000)

describe("recordToolCall / getToolCallRecord", () => {
  it("returns undefined when no record exists yet", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      const record = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        1
      )

      expect(record).toBeUndefined()
    })
  })

  it("returns a recorded call's status and body on lookup", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { confirmed: true },
      })

      const record = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        1
      )

      expect(record?.status).toBe(200)
      expect(record?.body).toEqual({ confirmed: true })
    })
  })

  it("keeps distinct occurrences of the same content hash separate", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { item: "apple #1" },
      })
      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 2,
        status: 200,
        body: { item: "apple #2" },
      })

      const first = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        1
      )
      const second = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        2
      )

      expect(first?.body).toEqual({ item: "apple #1" })
      expect(second?.body).toEqual({ item: "apple #2" })
    })
  })

  it("ignores a racing duplicate insert from an equally valid writer, keeping the first write", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { attempt: "first" },
      })
      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 500,
        body: { attempt: "second" },
      })

      const record = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        1
      )

      expect(record?.body).toEqual({ attempt: "first" })
    })
  })

  it("drops a write from a worker whose lease has already moved to someone else, instead of letting it win the race", async () => {
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
        new Date(Date.now() - 1000)
      )
      // worker-2 reclaimed the execution while worker-1's tool request was still in flight.
      await startExecution(tx, execution.id, "worker-2", farFuture)

      // worker-1's request finally resolves and it tries to record the result under its
      // now-stale ownership.
      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { from: "stale worker-1" },
      })

      const record = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        1
      )
      expect(record).toBeUndefined()

      // worker-2's own, legitimate write for the same call still lands normally.
      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-2",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { from: "worker-2" },
      })

      const afterValidWrite = await getToolCallRecord(
        tx,
        execution.id,
        "ai-1",
        "hash-1",
        1
      )
      expect(afterValidWrite?.body).toEqual({ from: "worker-2" })
    })
  })

  it("does not find a record scoped to a different node in the same execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await startExecution(tx, execution.id, "worker-1", farFuture)

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        leasedBy: "worker-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: {},
      })

      const record = await getToolCallRecord(
        tx,
        execution.id,
        "ai-2",
        "hash-1",
        1
      )

      expect(record).toBeUndefined()
    })
  })
})

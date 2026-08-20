import { describe, expect, it } from "vitest"
import { createExecution } from "./execution.repository.js"
import {
  getToolCallRecord,
  recordToolCall,
} from "./tool-call-record.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

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

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
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

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { item: "apple #1" },
      })
      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
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

  it("ignores a racing duplicate insert instead of erroring, keeping the first write", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
        contentHash: "hash-1",
        occurrence: 1,
        status: 200,
        body: { attempt: "first" },
      })
      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
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

  it("does not find a record scoped to a different node in the same execution", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow, version } = await createTestFixtures(tx)
      const execution = await createExecution(tx, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })

      await recordToolCall(tx, {
        executionId: execution.id,
        nodeId: "ai-1",
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

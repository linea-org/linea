import { afterAll, afterEach, describe, expect, it } from "vitest"
import type { Queue, Worker } from "bullmq"
import { createConnection } from "../connection.js"
import {
  createWorkflowExecutionQueue,
  createWorkflowExecutionWorker,
  enqueueWorkflowExecution,
  type WorkflowExecutionJob,
} from "./workflow-execution.js"

const connection = createConnection()
let queue: Queue<WorkflowExecutionJob> | undefined
let worker: Worker<WorkflowExecutionJob> | undefined

afterEach(async () => {
  await worker?.close()
  await queue?.obliterate({ force: true })
  await queue?.close()
  worker = undefined
  queue = undefined
})

afterAll(async () => {
  await connection.quit()
})

describe("workflow-execution queue", () => {
  it("configures retries with backoff, so a lost lease isn't left permanently stuck", async () => {
    queue = createWorkflowExecutionQueue(connection)

    const job = await enqueueWorkflowExecution(queue, {
      executionId: "exec-retry",
    })

    expect(job.opts.attempts).toBeGreaterThan(1)
    expect(job.opts.backoff).toBeTruthy()
  })

  it("delivers an enqueued job's payload to a worker", async () => {
    queue = createWorkflowExecutionQueue(connection)

    const delivered = new Promise<WorkflowExecutionJob>((resolve, reject) => {
      worker = createWorkflowExecutionWorker(connection, async (job) => {
        resolve(job.data)
      })
      worker.on("failed", (_job, error) => reject(error))
    })

    await enqueueWorkflowExecution(queue, { executionId: "exec-1" })

    await expect(delivered).resolves.toEqual({ executionId: "exec-1" })
  })

  it("delivers each job to exactly one of two competing workers", async () => {
    queue = createWorkflowExecutionQueue(connection)
    const executionIds = [
      "exec-a",
      "exec-b",
      "exec-c",
      "exec-d",
      "exec-e",
      "exec-f",
    ]
    const receivedByA: WorkflowExecutionJob[] = []
    const receivedByB: WorkflowExecutionJob[] = []

    const workerA = createWorkflowExecutionWorker(connection, async (job) => {
      receivedByA.push(job.data)
    })
    const workerB = createWorkflowExecutionWorker(connection, async (job) => {
      receivedByB.push(job.data)
    })

    try {
      const completions = new Promise<void>((resolve, reject) => {
        let count = 0
        const onCompleted = () => {
          count += 1
          if (count === executionIds.length) resolve()
        }
        workerA.on("completed", onCompleted)
        workerB.on("completed", onCompleted)
        workerA.on("failed", (_job, error) => reject(error))
        workerB.on("failed", (_job, error) => reject(error))
      })

      for (const executionId of executionIds) {
        await enqueueWorkflowExecution(queue, { executionId })
      }

      await completions

      // No job landed on both workers — the actual duplicate-delivery regression.
      const idsInA = new Set(receivedByA.map((job) => job.executionId))
      const overlap = receivedByB.filter((job) => idsInA.has(job.executionId))
      expect(overlap).toEqual([])

      const allReceived = [...receivedByA, ...receivedByB]
        .map((job) => job.executionId)
        .sort()
      expect(allReceived).toEqual([...executionIds].sort())
    } finally {
      await workerA.close()
      await workerB.close()
    }
  })
})

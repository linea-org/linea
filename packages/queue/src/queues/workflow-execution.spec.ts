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

  it("delivers each job to only one worker", async () => {
    queue = createWorkflowExecutionQueue(connection)
    const received: WorkflowExecutionJob[] = []

    worker = createWorkflowExecutionWorker(connection, async (job) => {
      received.push(job.data)
    })

    const completions = new Promise<void>((resolve, reject) => {
      let count = 0
      worker?.on("completed", () => {
        count += 1
        if (count === 3) resolve()
      })
      worker?.on("failed", (_job, error) => reject(error))
    })

    await enqueueWorkflowExecution(queue, { executionId: "exec-a" })
    await enqueueWorkflowExecution(queue, { executionId: "exec-b" })
    await enqueueWorkflowExecution(queue, { executionId: "exec-c" })

    await completions

    expect(received.map((job) => job.executionId).sort()).toEqual([
      "exec-a",
      "exec-b",
      "exec-c",
    ])
  })
})

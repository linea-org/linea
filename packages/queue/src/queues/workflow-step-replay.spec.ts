import { afterAll, afterEach, describe, expect, it } from "vitest"
import type { Queue, Worker } from "bullmq"
import { createConnection } from "../connection.js"
import {
  createWorkflowStepReplayQueue,
  createWorkflowStepReplayWorker,
  enqueueWorkflowStepReplay,
  type WorkflowStepReplayJob,
} from "./workflow-step-replay.js"

const connection = createConnection()
let queue: Queue<WorkflowStepReplayJob> | undefined
let worker: Worker<WorkflowStepReplayJob> | undefined

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

const job: WorkflowStepReplayJob = {
  replayStepId: "replay-1",
  originalStepId: "step-1",
  overrideConfig: { prompt: "new prompt" },
}

describe("workflow-step-replay queue", () => {
  it("delivers an enqueued job's payload to a worker", async () => {
    queue = createWorkflowStepReplayQueue(connection)

    const delivered = new Promise<WorkflowStepReplayJob>((resolve, reject) => {
      worker = createWorkflowStepReplayWorker(connection, async (received) => {
        resolve(received.data)
      })
      worker.on("failed", (_job, error) => reject(error))
    })

    await enqueueWorkflowStepReplay(queue, job)

    await expect(delivered).resolves.toEqual(job)
  })

  it("delivers each job to exactly one of two competing workers", async () => {
    queue = createWorkflowStepReplayQueue(connection)
    const jobs: WorkflowStepReplayJob[] = Array.from({ length: 6 }, (_, i) => ({
      replayStepId: `replay-${i}`,
      originalStepId: `step-${i}`,
      overrideConfig: {},
    }))
    const receivedByA: WorkflowStepReplayJob[] = []
    const receivedByB: WorkflowStepReplayJob[] = []

    const workerA = createWorkflowStepReplayWorker(connection, async (job) => {
      receivedByA.push(job.data)
    })
    const workerB = createWorkflowStepReplayWorker(connection, async (job) => {
      receivedByB.push(job.data)
    })

    try {
      const completions = new Promise<void>((resolve, reject) => {
        let count = 0
        const onCompleted = () => {
          count += 1
          if (count === jobs.length) resolve()
        }
        workerA.on("completed", onCompleted)
        workerB.on("completed", onCompleted)
        workerA.on("failed", (_job, error) => reject(error))
        workerB.on("failed", (_job, error) => reject(error))
      })

      for (const j of jobs) {
        await enqueueWorkflowStepReplay(queue, j)
      }

      await completions

      // No job landed on both workers — the actual duplicate-delivery regression.
      const idsInA = new Set(receivedByA.map((job) => job.replayStepId))
      const overlap = receivedByB.filter((job) => idsInA.has(job.replayStepId))
      expect(overlap).toEqual([])

      const allReceived = [...receivedByA, ...receivedByB]
        .map((job) => job.replayStepId)
        .sort()
      expect(allReceived).toEqual(jobs.map((j) => j.replayStepId).sort())
    } finally {
      await workerA.close()
      await workerB.close()
    }
  })
})

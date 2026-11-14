import { randomUUID } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { DelayedError, Queue, Worker } from "bullmq"
import { createConnection } from "./connection.js"
import {
  EXECUTION_WORKSPACE_CONCURRENCY,
  executionAdmissionKey,
  withExecutionAdmission,
} from "./execution-admission.js"

type Payload = { executionId: string }

const connection = createConnection()
const queue = new Queue<Payload>(`execution-admission-spec-${randomUUID()}`, {
  connection,
})
const workers: Worker<Payload>[] = []
const keys: string[] = []

function workspace(): string {
  const workspaceId = randomUUID()
  keys.push(executionAdmissionKey(workspaceId))
  return workspaceId
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(workers.splice(0).map((worker) => worker.close()))
  if (keys.length) await connection.del(...keys.splice(0))
})

afterAll(async () => {
  await queue.obliterate({ force: true })
  await queue.close()
  await connection.quit()
})

describe("per-workspace execution admission", () => {
  it("caps one workspace's in-flight executions across clients while another workspace still runs", async () => {
    const other = createConnection()
    const tenantA = workspace()
    const worker = new Worker<Payload>(queue.name, async () => {}, {
      connection,
      autorun: false,
    })
    workers.push(worker)
    const total = EXECUTION_WORKSPACE_CONCURRENCY * 3
    await Promise.all(
      Array.from({ length: total }, () =>
        queue.add("execute", { executionId: randomUUID() })
      )
    )
    const active = await Promise.all(
      Array.from({ length: total }, () => worker.getNextJob(randomUUID()))
    )
    let admitted = 0
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const processing = active.map((job, i) => {
      if (!job) throw new Error("Missing active job")
      return withExecutionAdmission(
        i % 2 ? connection : other,
        job,
        job.token,
        tenantA,
        async () => {
          admitted += 1
          await held
        }
      ).catch((error: unknown) => {
        if (!(error instanceof DelayedError)) throw error
      })
    })
    try {
      await expect.poll(() => admitted).toBe(EXECUTION_WORKSPACE_CONCURRENCY)
      const job = await queue.add("execute", { executionId: randomUUID() })
      let progressed = false
      await withExecutionAdmission(other, job, undefined, workspace(), () => {
        progressed = true
        return Promise.resolve()
      })
      expect(progressed).toBe(true)
    } finally {
      release()
      await Promise.all(processing)
      await other.quit()
    }
    expect(admitted).toBe(EXECUTION_WORKSPACE_CONCURRENCY)
    const delayed = await queue.getDelayed()
    expect(delayed).toHaveLength(total - EXECUTION_WORKSPACE_CONCURRENCY)
    expect(delayed.every((job) => job.attemptsMade === 0)).toBe(true)
    expect(await connection.zcard(executionAdmissionKey(tenantA))).toBe(0)
  })

  it("releases the slot when the execution throws", async () => {
    const workspaceId = workspace()
    const job = await queue.add("execute", { executionId: randomUUID() })
    await expect(
      withExecutionAdmission(connection, job, undefined, workspaceId, () =>
        Promise.reject(new Error("run failed"))
      )
    ).rejects.toThrow("run failed")
    expect(await connection.zcard(executionAdmissionKey(workspaceId))).toBe(0)
  })

  it("renews the slot while a long execution runs and reclaims slots left by a dead worker", async () => {
    const intervals = vi.spyOn(globalThis, "setInterval")
    const workspaceId = workspace()
    const key = executionAdmissionKey(workspaceId)
    for (let i = 0; i < EXECUTION_WORKSPACE_CONCURRENCY; i++)
      await connection.zadd(key, 0, `dead-worker-${i}`)
    const job = await queue.add("execute", { executionId: randomUUID() })
    await withExecutionAdmission(
      connection,
      job,
      undefined,
      workspaceId,
      async () => {
        expect(await connection.zcard(key)).toBe(1)
        const [lease] = await connection.zrange(key, 0, -1)
        if (!lease) throw new Error("Missing admission lease")
        await connection.zadd(key, 0, lease)
        const renew = intervals.mock.calls.at(-1)?.[0]
        if (typeof renew !== "function") throw new Error("Renewal not started")
        renew()
        await expect
          .poll(async () => Number(await connection.zscore(key, lease)))
          .toBeGreaterThan(Date.now())
      }
    )
    expect(await connection.zcard(key)).toBe(0)
  })
})

import { randomUUID, createHash } from "node:crypto"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { DelayedError, QueueEvents, Worker } from "bullmq"
import { createConnection } from "./connection.js"
import {
  withWebhookAdmission,
  WEBHOOK_WORKSPACE_CONCURRENCY,
} from "./webhook-admission.js"
import {
  createWebhookDeliveryQueue,
  createWebhookDeliveryWorker,
  enqueueWebhookDelivery,
  type WebhookDeliveryJob,
} from "./queues/webhook-delivery.js"

const connection = createConnection()
const queue = createWebhookDeliveryQueue(connection)
const workers: Worker<WebhookDeliveryJob>[] = []
const keys: string[] = []

function scope(workspaceId: string, url: string) {
  const prefix = `webhook-admission:{${workspaceId}}`
  const webhookId = randomUUID()
  keys.push(
    prefix,
    `${prefix}:endpoint:${webhookId}`,
    `${prefix}:origin:${createHash("sha256").update(new URL(url).origin).digest("hex")}`
  )
  return { workspaceId, webhookId, url }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(workers.splice(0).map((worker) => worker.close()))
  await queue.obliterate({ force: true })
  if (keys.length) await connection.del(...keys.splice(0))
})

afterAll(async () => {
  await queue.close()
  await connection.quit()
})

describe("distributed webhook admission", () => {
  it("aborts processing before lease expiry and releases all admission keys", async () => {
    const timers = vi.spyOn(globalThis, "setTimeout")
    const destination = scope(randomUUID(), "https://expiry.example.com")
    const admissionKeys = keys.slice(-3)
    const job = await enqueueWebhookDelivery(queue, {
      deliveryId: randomUUID(),
    })
    await expect(
      withWebhookAdmission(
        connection,
        job,
        undefined,
        destination,
        async (signal) => {
          const timer = timers.mock.calls.find(
            ([, delay]) =>
              typeof delay === "number" && delay > 50_000 && delay <= 55_000
          )
          if (!timer) throw new Error("Admission timer did not start")
          const aborted = new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true })
          )
          timer[0]()
          await aborted
          signal.throwIfAborted()
        }
      )
    ).rejects.toThrow("admission lease expired")
    for (const key of admissionKeys) expect(await connection.zcard(key)).toBe(0)
  })
  it("atomically bounds workspace and duplicate-origin admission across clients", async () => {
    const other = createConnection()
    const workspaceId = randomUUID()
    const admitted: string[] = []
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const worker = new Worker<WebhookDeliveryJob>(queue.name, async () => {}, {
      connection,
      autorun: false,
    })
    workers.push(worker)
    const jobs = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        enqueueWebhookDelivery(queue, { deliveryId: randomUUID() }).then(
          (job) => ({
            job,
            destination: scope(
              workspaceId,
              `https://host${i % 8}.example.com/path${i}`
            ),
          })
        )
      )
    )
    for (let i = 0; i < jobs.length; i++) {
      const active = await worker.getNextJob(randomUUID())
      if (!active) throw new Error("Missing active job")
      const index = jobs.findIndex(
        (candidate) => candidate.job.id === active.id
      )
      if (index < 0) throw new Error("Unknown job")
      jobs[index].job = active
    }
    const processing = jobs.map(({ job, destination }, i) =>
      withWebhookAdmission(
        i % 2 ? connection : other,
        job,
        job.token,
        destination,
        async () => {
          admitted.push(destination.url)
          await held
        }
      ).catch((error: unknown) => {
        if (!(error instanceof DelayedError)) throw error
      })
    )
    try {
      await expect
        .poll(() => admitted.length)
        .toBe(WEBHOOK_WORKSPACE_CONCURRENCY)
      expect(new Set(admitted.map((url) => new URL(url).origin)).size).toBe(
        admitted.length
      )
      const tenantB = scope(randomUUID(), "https://other.example.com")
      const job = await enqueueWebhookDelivery(queue, {
        deliveryId: randomUUID(),
      })
      let progressed = false
      await withWebhookAdmission(other, job, undefined, tenantB, async () => {
        progressed = true
      })
      expect(progressed).toBe(true)
    } finally {
      release()
      await Promise.all(processing)
      await other.quit()
    }
    const rejected = await queue.getDelayed()
    expect(rejected).toHaveLength(36)
    expect(rejected.every((job) => job.attemptsMade === 0)).toBe(true)
  })
  it("cleans crashed leases and does not release a replacement owner's slot", async () => {
    const destination = scope(randomUUID(), "https://crashed.example.com")
    const [workspaceKey, originKey] = keys.slice(-3)
    if (!workspaceKey || !originKey) throw new Error("Missing admission keys")
    await connection.zadd(workspaceKey, 0, "dead-process")
    await connection.zadd(originKey, 0, "dead-process")
    const job = await enqueueWebhookDelivery(queue, {
      deliveryId: randomUUID(),
    })
    await withWebhookAdmission(
      connection,
      job,
      undefined,
      destination,
      async () => {
        expect(await connection.zscore(workspaceKey, "dead-process")).toBeNull()
        expect(await connection.pttl(workspaceKey)).toBeGreaterThan(0)
        await connection.zadd(workspaceKey, Date.now() + 60_000, "replacement")
      }
    )
    expect(await connection.zrange(workspaceKey, 0, -1)).toEqual([
      "replacement",
    ])
  })
  it("keeps one endpoint serialized when its destination changes", async () => {
    const destination = scope(randomUUID(), "https://before.example.com")
    const changed = { ...destination, url: "https://after.example.com" }
    keys.push(
      `webhook-admission:{${destination.workspaceId}}:origin:${createHash("sha256").update(new URL(changed.url).origin).digest("hex")}`
    )
    const worker = new Worker<WebhookDeliveryJob>(queue.name, async () => {}, {
      connection,
      autorun: false,
    })
    workers.push(worker)
    await enqueueWebhookDelivery(queue, { deliveryId: randomUUID() })
    await enqueueWebhookDelivery(queue, { deliveryId: randomUUID() })
    const first = await worker.getNextJob(randomUUID())
    const second = await worker.getNextJob(randomUUID())
    if (!first || !second) throw new Error("Missing active jobs")
    await withWebhookAdmission(
      connection,
      first,
      first.token,
      destination,
      async () => {
        await expect(
          withWebhookAdmission(
            connection,
            second,
            second.token,
            changed,
            async () => {
              throw new Error("Endpoint quota was bypassed")
            }
          )
        ).rejects.toBeInstanceOf(DelayedError)
      }
    )
    expect((await queue.getJob(second.id ?? ""))?.attemptsMade).toBe(0)
  })
  it("releases failed attempts so retries can acquire again", async () => {
    const destination = scope(randomUUID(), "https://retry.example.com")
    const job = await enqueueWebhookDelivery(queue, {
      deliveryId: randomUUID(),
    })
    await expect(
      withWebhookAdmission(
        connection,
        job,
        undefined,
        destination,
        async () => {
          throw new Error("request failed")
        }
      )
    ).rejects.toThrow("request failed")
    await withWebhookAdmission(
      connection,
      job,
      undefined,
      destination,
      async () => {}
    )
    expect(
      await connection.zcard(`webhook-admission:{${destination.workspaceId}}`)
    ).toBe(0)
  })
  it("lets another tenant finish behind a saturated tenant using real workers without burning retries", async () => {
    const events = new QueueEvents(queue.name, { connection })
    await events.waitUntilReady()
    const tenantA = randomUUID()
    const destinations = new Map<string, ReturnType<typeof scope>>()
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let active = 0
    const processor = async (
      job: Parameters<Parameters<typeof createWebhookDeliveryWorker>[1]>[0],
      token: string | undefined
    ) => {
      const destination = destinations.get(job.data.deliveryId)
      if (!destination) throw new Error("Missing destination")
      await withWebhookAdmission(
        connection,
        job,
        token,
        destination,
        async () => {
          if (destination.workspaceId === tenantA) {
            active++
            await held
          }
        }
      )
    }
    try {
      for (let i = 0; i < 30; i++) {
        const deliveryId = randomUUID()
        destinations.set(
          deliveryId,
          scope(tenantA, `https://host${i}.example.com`)
        )
        await enqueueWebhookDelivery(queue, { deliveryId })
      }
      workers.push(
        createWebhookDeliveryWorker(connection, processor),
        createWebhookDeliveryWorker(connection, processor)
      )
      await expect.poll(() => active).toBe(4)
      const deliveryId = randomUUID()
      destinations.set(
        deliveryId,
        scope(randomUUID(), "https://healthy.example.com")
      )
      const healthy = await enqueueWebhookDelivery(queue, { deliveryId })
      await healthy.waitUntilFinished(events, 5_000)
      expect(active).toBe(4)
      const delayed = await queue.getDelayed()
      expect(delayed.length).toBeGreaterThan(0)
      expect(delayed.every((job) => job.attemptsMade === 0)).toBe(true)
    } finally {
      release()
      await events.close()
    }
  })
})

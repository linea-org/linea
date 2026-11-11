import "dotenv/config"
import { createServer } from "node:net"
import { randomUUID } from "node:crypto"
import { createConnection } from "@linea/queue"
import { consumeApprovalEmailQuota } from "./approval-email-quota"

it("atomically caps concurrent sends per workspace and isolates other workspaces", async () => {
  const workspaceId = randomUUID()
  const results = await Promise.all(
    Array.from({ length: 6 }, () => consumeApprovalEmailQuota(workspaceId, 20))
  )
  expect(results.filter(Boolean)).toHaveLength(5)
  expect(await consumeApprovalEmailQuota(workspaceId, 1)).toBe(false)
  expect(await consumeApprovalEmailQuota(randomUUID(), 20)).toBe(true)
})

it("refuses the send that would exceed the daily quota without consuming hourly capacity", async () => {
  const workspaceId = randomUUID()
  const connection = createConnection()
  const dayKey = `approval-email:${workspaceId}:day:${Math.floor(Date.now() / 86_400_000)}`
  try {
    await connection.set(dayKey, 990, "EX", 86400)
    expect(await consumeApprovalEmailQuota(workspaceId, 20)).toBe(false)
    expect(await consumeApprovalEmailQuota(workspaceId, 10)).toBe(true)
    expect(await consumeApprovalEmailQuota(workspaceId, 1)).toBe(false)
  } finally {
    await connection.del(dayKey)
    await connection.quit()
  }
})

it("bounds a quota lookup when Redis accepts a connection but never replies", async () => {
  const sockets = new Set<import("node:net").Socket>()
  const server = createServer((socket) => sockets.add(socket))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Expected TCP listener")
  jest.replaceProperty(process, "env", {
    ...process.env,
    REDIS_URL: `redis://127.0.0.1:${address.port}`,
  })
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] })
  try {
    const connected = new Promise<void>((resolve) =>
      server.once("connection", () => resolve())
    )
    const pending = consumeApprovalEmailQuota(randomUUID(), 1)
    const rejected = expect(pending).rejects.toThrow("quota lookup timed out")
    await connected
    await jest.advanceTimersByTimeAsync(5_000)
    await rejected
  } finally {
    jest.useRealTimers()
    jest.restoreAllMocks()
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})

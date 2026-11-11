import "dotenv/config"
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

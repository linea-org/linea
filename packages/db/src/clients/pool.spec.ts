import { randomInt } from "node:crypto"
import { afterAll, expect, it } from "vitest"
import { pool } from "./pool.js"

afterAll(async () => {
  await pool.end()
})

it("terminates a database wait on a held lock", async () => {
  const holder = await pool.connect()
  const waiter = await pool.connect()
  const key = randomInt(1, 2_147_483_647)
  try {
    await holder.query("BEGIN")
    await holder.query("SELECT pg_advisory_xact_lock($1)", [key])
    await waiter.query("SET statement_timeout = '12s'")
    await expect(
      waiter.query("SELECT pg_advisory_xact_lock($1)", [key])
    ).rejects.toMatchObject({ code: "55P03" })
  } finally {
    await holder.query("ROLLBACK")
    holder.release()
    waiter.release()
  }
}, 15_000)

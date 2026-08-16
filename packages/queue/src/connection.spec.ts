import { describe, expect, it } from "vitest"
import { createConnection } from "./connection.js"

describe("createConnection", () => {
  it("attaches an error listener, so a stray socket error after teardown doesn't crash the process as unhandled", async () => {
    const connection = createConnection()
    expect(connection.listenerCount("error")).toBeGreaterThan(0)
    await connection.quit()
  })
})

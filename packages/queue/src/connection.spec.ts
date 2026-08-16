import { afterEach, describe, expect, it, vi } from "vitest"
import { createConnection } from "./connection.js"

describe("createConnection", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("attaches an error listener, so a stray socket error after teardown doesn't crash the process as unhandled", async () => {
    const connection = createConnection()
    expect(connection.listenerCount("error")).toBeGreaterThan(0)
    await connection.quit()
  })

  it("swallows a stray already-closed error without logging it", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const connection = createConnection()
    connection.emit("error", new Error("Connection is closed."))
    expect(errorSpy).not.toHaveBeenCalled()
    await connection.quit()
  })

  it("logs any other connection error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const connection = createConnection()
    connection.emit("error", new Error("ECONNREFUSED"))
    expect(errorSpy).toHaveBeenCalledWith(
      "Redis connection error: ECONNREFUSED"
    )
    await connection.quit()
  })
})

import { createServer } from "node:http"
import { HttpNode } from "./http.node"
import { NonRetryableError } from "./non-retryable-error"

it("blocks an internal HTTP node before the server receives a request", async () => {
  let requests = 0
  const server = createServer((_request, response) => {
    requests += 1
    response.end("internal-only data")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  jest.replaceProperty(process, "env", {
    ...process.env,
    NODE_ENV: "production",
    EXECUTION_HTTP_ALLOW_LOCAL: "true",
  })
  try {
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Expected TCP listener")
    await expect(
      new HttpNode().execute(
        { url: `http://127.0.0.1:${address.port}`, method: "GET" },
        null,
        { workspaceId: "workspace" }
      )
    ).rejects.toBeInstanceOf(NonRetryableError)
    expect(requests).toBe(0)
  } finally {
    jest.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})

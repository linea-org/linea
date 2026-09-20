import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { LineaApiError } from "../http/errors.js"
import { LineaApplicationClient } from "./application-client.js"
import { applicationKey, workspaceKey } from "./credentials.js"
import { LineaWorkspaceClient } from "./workspace-client.js"

type RecordedRequest = {
  method: string | undefined
  url: string | undefined
  authorization: string | undefined
  idempotencyKey: string | undefined
  body: unknown
}

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
  recorded: RecordedRequest
) => void

const servers: ReturnType<typeof createServer>[] = []

async function testServer(
  handler: Handler
): Promise<{ baseUrl: string; requests: RecordedRequest[] }> {
  const requests: RecordedRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Uint8Array[] = []
    request.on("data", (chunk: unknown) => {
      if (typeof chunk === "string") chunks.push(Buffer.from(chunk))
      else if (chunk instanceof Uint8Array) chunks.push(chunk)
      else throw new Error("Unexpected request body chunk")
    })
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8")
      const idempotencyHeader = request.headers["idempotency-key"]
      const body = text ? (JSON.parse(text) as unknown) : undefined
      const recorded = {
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        idempotencyKey: Array.isArray(idempotencyHeader)
          ? idempotencyHeader[0]
          : idempotencyHeader,
        body,
      }
      requests.push(recorded)
      handler(request, response, recorded)
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Test server has no TCP address")
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests }
}

function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(body))
}

function execution() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    applicationId: "00000000-0000-4000-8000-000000000002",
    workflowId: "00000000-0000-4000-8000-000000000003",
    externalSubjectId: "00000000-0000-4000-8000-000000000004",
    conversationId: null,
    status: "queued",
    output: null,
    error: null,
    createdAt: "2026-09-18T10:00:00.000Z",
    startedAt: null,
    completedAt: null,
  }
}

describe("server SDK public HTTP contract", () => {
  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve()))
        )
    )
  })

  it("scopes Application operations to the constructed Application and sends idempotency", async () => {
    const fixture = execution()
    const server = await testServer((_request, response) =>
      json(response, fixture, 202)
    )
    const client = new LineaApplicationClient({
      applicationId: fixture.applicationId,
      applicationKey: applicationKey("lin_app_secret"),
      baseUrl: server.baseUrl,
    })
    const result = await client.startExecution(
      {
        workflowId: fixture.workflowId,
        externalSubjectId: fixture.externalSubjectId,
        input: { ticketId: "ticket-1" },
      },
      { idempotencyKey: "start-ticket-1" }
    )
    expect(result).toEqual(fixture)
    expect(server.requests).toEqual([
      {
        method: "POST",
        url: `/v1/applications/${fixture.applicationId}/executions`,
        authorization: "Bearer lin_app_secret",
        idempotencyKey: "start-ticket-1",
        body: {
          workflowId: fixture.workflowId,
          externalSubjectId: fixture.externalSubjectId,
          input: { ticketId: "ticket-1" },
        },
      },
    ])
  })

  it("retries safe reads after a transient response", async () => {
    const fixture = execution()
    let attempts = 0
    const server = await testServer((_request, response) => {
      attempts += 1
      if (attempts === 1)
        json(
          response,
          { error: { code: "service_unavailable", message: "retry" } },
          503
        )
      else json(response, fixture)
    })
    const client = new LineaApplicationClient({
      applicationId: fixture.applicationId,
      applicationKey: applicationKey("lin_app_secret"),
      baseUrl: server.baseUrl,
    })
    await expect(client.getExecution(fixture.id)).resolves.toEqual(fixture)
    expect(attempts).toBe(2)
  })

  it("surfaces terminal conflicts without retrying", async () => {
    let attempts = 0
    const server = await testServer((_request, response) => {
      attempts += 1
      json(
        response,
        { error: { code: "idempotency_conflict", message: "Key reused" } },
        409
      )
    })
    const client = new LineaApplicationClient({
      applicationId: "00000000-0000-4000-8000-000000000002",
      applicationKey: applicationKey("lin_app_secret"),
      baseUrl: server.baseUrl,
    })
    let error: unknown
    try {
      await client.cancelExecution("00000000-0000-4000-8000-000000000001", {
        idempotencyKey: "cancel-1",
      })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(LineaApiError)
    expect(error).toMatchObject({ status: 409, code: "idempotency_conflict" })
    expect(attempts).toBe(1)
  })

  it("uses a typed workspace credential for inherited and Regression operations", async () => {
    const server = await testServer((request, response) => {
      if (request.url === "/v1/signals") json(response, [])
      else json(response, [])
    })
    const client = new LineaWorkspaceClient({
      workspaceKey: workspaceKey("lin_workspace_secret"),
      baseUrl: server.baseUrl,
    })
    await expect(client.listSignals()).resolves.toEqual([])
    await expect(client.listRegressionRuns("workflow-1")).resolves.toEqual([])
    expect(server.requests.map(({ url }) => url)).toEqual([
      "/v1/signals",
      "/v1/workflows/workflow-1/regression-runs",
    ])
  })

  it("exposes separate bounded audit clients for Application and workspace audiences", async () => {
    const applicationId = "00000000-0000-4000-8000-000000000002"
    const auditEvent = {
      id: "10000000-0000-4000-8000-000000000001",
      type: "connection.revoked",
      applicationId,
      subjectReference: "30000000-0000-4000-8000-000000000003",
      connectionId: "40000000-0000-4000-8000-000000000004",
      actionIntentId: null,
      decisionId: null,
      provider: "github",
      operation: null,
      digest: null,
      outcome: "revoked",
      failureClass: null,
      display: null,
      occurredAt: "2026-09-20T00:00:00.000Z",
    }
    const server = await testServer((_request, response) =>
      json(response, { data: [auditEvent], nextCursor: null })
    )
    const application = new LineaApplicationClient({
      applicationId,
      applicationKey: applicationKey("lin_app_secret"),
      baseUrl: server.baseUrl,
    })
    const workspace = new LineaWorkspaceClient({
      workspaceKey: workspaceKey("lin_workspace_secret"),
      baseUrl: server.baseUrl,
    })
    await expect(application.listAuditEvents({ limit: 10 })).resolves.toEqual({
      data: [auditEvent],
      nextCursor: null,
    })
    await expect(
      workspace.listAuditEvents({ applicationId, limit: 20 })
    ).resolves.toEqual({ data: [auditEvent], nextCursor: null })
    expect(server.requests.map(({ url }) => url)).toEqual([
      `/v1/applications/${applicationId}/audit-events?limit=10`,
      `/v1/audit-events?applicationId=${applicationId}&limit=20`,
    ])
  })

  it("rejects credential kinds at construction boundaries", () => {
    expect(() => applicationKey("lin_workspace_secret")).toThrow(/lin_app_/)
    expect(() => workspaceKey("workspace_secret")).toThrow(/lin_/)
    expect(() => workspaceKey("lin_")).toThrow(/lin_/)
  })
})

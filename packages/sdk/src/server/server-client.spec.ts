import { LineaConnectionAdminClient } from "./connection-admin-client.js"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { afterEach, describe, expect, it } from "vitest"
import { LineaApiError } from "../http/errors.js"
import { LineaEnvironmentClient } from "./environment-client.js"
import { environmentKey } from "./credentials.js"
import { Linea } from "../linea.js"

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
    environmentId: "00000000-0000-4000-8000-000000000002",
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
  it("administers shared connections with an Operator cookie and never substitutes a machine key", async () => {
    const envId = "00000000-0000-4000-8000-000000000002"
    const server = await testServer((request, response) => {
      expect(request.headers.cookie).toBe("session=operator-test")
      expect(request.headers.authorization).toBeUndefined()
      json(response, [])
    })
    const client = new LineaConnectionAdminClient({
      baseUrl: server.baseUrl,
      environmentId: envId,
      sessionCookie: "session=operator-test",
    })
    expect(await client.listConnections()).toEqual([])
    expect(server.requests[0]?.url).toBe(
      `/v1/environments/${envId}/connections`
    )
  })
  it("does not retry a failed installation setup", async () => {
    const server = await testServer((_request, response) =>
      json(response, { message: "Provider unavailable" }, 503)
    )
    const client = new LineaConnectionAdminClient({
      baseUrl: server.baseUrl,
      environmentId: "00000000-0000-4000-8000-000000000002",
      sessionCookie: "session=operator-test",
    })
    await expect(
      client.createGithubInstallation({
        appClientId: "123",
        installationId: 42,
        privateKey: "test PEM",
        permissions: { metadata: "read", issues: "read" },
      })
    ).rejects.toBeInstanceOf(LineaApiError)
    expect(server.requests).toHaveLength(1)
  })
  it("scopes Environment operations to the constructed Environment and sends idempotency", async () => {
    const fixture = execution()
    const server = await testServer((_request, response) =>
      json(response, fixture, 202)
    )
    const client = new LineaEnvironmentClient({
      environmentId: fixture.environmentId,
      environmentKey: environmentKey("lin_env_secret"),
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
        url: `/v1/environments/${fixture.environmentId}/executions`,
        authorization: "Bearer lin_env_secret",
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
    const client = new LineaEnvironmentClient({
      environmentId: fixture.environmentId,
      environmentKey: environmentKey("lin_env_secret"),
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
    const client = new LineaEnvironmentClient({
      environmentId: "00000000-0000-4000-8000-000000000002",
      environmentKey: environmentKey("lin_env_secret"),
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
  it("ignores fields that a newer API adds to responses and errors", async () => {
    let status = 200
    const server = await testServer((_request, response) =>
      status === 200
        ? json(response, { ...execution(), addedLater: { nested: true } })
        : json(
            response,
            {
              error: {
                code: "resource_not_found",
                message: "Execution not found",
                helpUrl: "https://example.com",
              },
              requestId: "r1",
            },
            status
          )
    )
    const client = new LineaEnvironmentClient({
      environmentId: "00000000-0000-4000-8000-000000000002",
      environmentKey: environmentKey("lin_env_secret"),
      baseUrl: server.baseUrl,
    })
    await expect(client.getExecution(execution().id)).resolves.toEqual(
      execution()
    )
    status = 404
    await expect(client.getExecution(execution().id)).rejects.toMatchObject({
      status: 404,
      code: "resource_not_found",
      message: "Execution not found",
    })
  })
  it("lists webhook deliveries of event types it does not know", async () => {
    const envelope = {
      id: "event-1",
      type: "execution.completed",
      version: 1,
      createdAt: "2026-09-18T10:00:00.000Z",
      environmentId: "environment-1",
      data: { executionId: execution().id, status: "succeeded" },
    }
    const delivery = {
      id: "00000000-0000-4000-8000-000000000005",
      webhookId: "00000000-0000-4000-8000-000000000006",
      eventId: "event-1",
      eventType: "execution.completed",
      status: "succeeded",
      url: "https://example.com/hook",
      envelope,
      attempts: 1,
      responseStatus: 200,
      responseBody: null,
      lastError: null,
      nextAttemptAt: null,
      deliveredAt: "2026-09-18T10:00:00.000Z",
      failedAt: null,
      createdAt: "2026-09-18T10:00:00.000Z",
    }
    let data: object[] = [
      { ...delivery, addedLater: 1 },
      {
        ...delivery,
        eventType: "execution.archived",
        envelope: { ...envelope, type: "execution.archived", data: {} },
      },
    ]
    const server = await testServer((_request, response) =>
      json(response, { data, nextCursor: null })
    )
    const client = new LineaEnvironmentClient({
      environmentId: "00000000-0000-4000-8000-000000000002",
      environmentKey: environmentKey("lin_env_secret"),
      baseUrl: server.baseUrl,
    })
    await expect(client.listWebhookDeliveries()).resolves.toEqual({
      data: [
        delivery,
        { ...delivery, eventType: "execution.archived", envelope: null },
      ],
      nextCursor: null,
    })
    data = [{ ...delivery, envelope: { ...envelope, data: {} } }]
    await expect(client.listWebhookDeliveries()).rejects.toThrow(
      "Invalid protocol response"
    )
  })
  it("uses the workspace key for Signal and Regression operations", async () => {
    const server = await testServer((request, response) => {
      if (request.url === "/v1/signals") json(response, [])
      else json(response, [])
    })
    const client = new Linea({
      apiKey: "lin_workspace_secret",
      baseUrl: server.baseUrl,
    })
    await expect(client.signals.list()).resolves.toEqual([])
    await expect(client.regressions.listRuns("workflow-1")).resolves.toEqual([])
    expect(server.requests.map(({ url }) => url)).toEqual([
      "/v1/signals",
      "/v1/workflows/workflow-1/regression-runs",
    ])
  })
  it("exposes separate bounded audit clients for Environment and workspace audiences", async () => {
    const environmentId = "00000000-0000-4000-8000-000000000002"
    const auditEvent = {
      id: "10000000-0000-4000-8000-000000000001",
      type: "connection.revoked",
      environmentId,
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
    const environment = new LineaEnvironmentClient({
      environmentId,
      environmentKey: environmentKey("lin_env_secret"),
      baseUrl: server.baseUrl,
    })
    const workspace = new Linea({
      apiKey: "lin_workspace_secret",
      baseUrl: server.baseUrl,
    })
    await expect(environment.listAuditEvents({ limit: 10 })).resolves.toEqual({
      data: [auditEvent],
      nextCursor: null,
    })
    await expect(
      workspace.auditEvents.list({ environmentId, limit: 20 })
    ).resolves.toEqual({ data: [auditEvent], nextCursor: null })
    expect(server.requests.map(({ url }) => url)).toEqual([
      `/v1/environments/${environmentId}/audit-events?limit=10`,
      `/v1/audit-events?environmentId=${environmentId}&limit=20`,
    ])
  })
  it("rejects credential kinds at construction boundaries", () => {
    expect(() => environmentKey("lin_workspace_secret")).toThrow(/lin_env_/)
    expect(() => new Linea({ apiKey: "workspace_secret" })).toThrow(/lin_/)
    expect(() => new Linea({ apiKey: "lin_" })).toThrow(/lin_/)
    expect(() => new Linea({ apiKey: "lin_env_secret" })).toThrow(
      /Environment keys/
    )
  })
})

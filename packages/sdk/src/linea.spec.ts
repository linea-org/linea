import { afterEach, describe, expect, it, vi } from "vitest"
import { Linea } from "./linea.js"
import { LineaApiError, LineaTimeoutError } from "./http/errors.js"
import { nextExecutionsCursor } from "./types/index.js"
import type {
  Execution,
  ExecutionDetail,
  SignalDetailResponse,
  Workflow,
  WorkflowGraph,
} from "./types/index.js"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status < 300 ? "OK" : "Error",
    headers: { "content-type": "application/json" },
  })
}

function fixtureExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    id: "exec-1",
    workspaceId: "ws-1",
    workflowId: "wf-1",
    workflowVersionId: "wfv-1",
    environmentId: "env-123",
    workflowContractRevisionId: "contract-1",
    status: "succeeded",
    origin: "native",
    trigger: "webhook",
    triggerPayload: { hello: "world" },
    environment: "dev",
    triggeredByUserId: null,
    externalSubjectId: null,
    leasedBy: null,
    leaseExpiresAt: null,
    enqueueAttempts: 0,
    error: null,
    costMicros: "1500",
    costUnpriced: false,
    tokensInput: 10,
    tokensOutput: 20,
    startedAt: "2026-09-05T00:00:00.000Z",
    completedAt: "2026-09-05T00:00:01.000Z",
    createdAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  }
}

function client() {
  return new Linea({
    apiKey: "lin_test",
    baseUrl: "http://localhost:3000",
  })
}

describe("Linea", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  describe("workflows", () => {
    const workflow: Workflow = {
      id: "wf-1",
      workspaceId: "ws-1",
      applicationId: "app-1",
      name: "Support triage",
      slug: "support-triage",
      description: null,
      publishedVersionId: null,
      draftGraph: null,
      draftUpdatedAt: null,
      archivedAt: null,
      scratch: false,
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    }
    const graph: WorkflowGraph = {
      version: 1,
      trigger: { type: "api" },
      entryNodeId: "start",
      nodes: [
        { id: "start", type: "start" },
        { id: "end", type: "end" },
      ],
      edges: [{ from: "start", to: "end" }],
    }
    function lastCall(fetchSpy: { mock: { calls: unknown[][] } }) {
      const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
      return { url, method: init.method, body: init.body }
    }
    it("creates, updates, archives and drafts a workflow", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse(workflow)))
      const linea = client()
      await linea.workflows.create({
        applicationId: "app-1",
        name: "Support triage",
        slug: "support-triage",
        graph,
      })
      expect(lastCall(fetchSpy)).toEqual({
        url: "http://localhost:3000/v1/workflows",
        method: "POST",
        body: JSON.stringify({
          applicationId: "app-1",
          name: "Support triage",
          slug: "support-triage",
          graph,
        }),
      })
      await linea.workflows.update("wf-1", { name: "Triage" })
      expect(lastCall(fetchSpy)).toMatchObject({
        url: "http://localhost:3000/v1/workflows/wf-1",
        method: "PATCH",
        body: JSON.stringify({ name: "Triage" }),
      })
      await linea.workflows.archive("wf-1")
      expect(lastCall(fetchSpy).body).toBe(JSON.stringify({ archived: true }))
      await linea.workflows.saveDraft("wf-1", graph)
      expect(lastCall(fetchSpy)).toMatchObject({
        url: "http://localhost:3000/v1/workflows/wf-1/draft",
        method: "PUT",
        body: JSON.stringify({ graph }),
      })
    })
    it("reads workflows and their versions", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse([])))
      const linea = client()
      await linea.workflows.list()
      await linea.workflows.get("wf-1")
      await linea.workflows.listVersions("wf-1")
      await linea.workflows.getVersion("wf-1", "v 1")
      await linea.workflows.createVersion("wf-1", { graph, message: "First" })
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        "http://localhost:3000/v1/workflows",
        "http://localhost:3000/v1/workflows/wf-1",
        "http://localhost:3000/v1/workflows/wf-1/versions",
        "http://localhost:3000/v1/workflows/wf-1/versions/v%201",
        "http://localhost:3000/v1/workflows/wf-1/versions",
      ])
      expect(lastCall(fetchSpy)).toMatchObject({
        method: "POST",
        body: JSON.stringify({ graph, message: "First" }),
      })
    })
    it("runs a workflow with its input as the trigger payload", async () => {
      const fixture = fixtureExecution({ status: "queued" })
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(fixture))
      const result = await client().workflows.run("wf-1", {
        input: { ticket: "T-1" },
        externalSubjectId: "user-1",
      })
      expect(result).toEqual(fixture)
      expect(lastCall(fetchSpy)).toEqual({
        url: "http://localhost:3000/v1/workflows/wf-1/executions",
        method: "POST",
        body: JSON.stringify({
          triggerPayload: { ticket: "T-1" },
          externalSubjectId: "user-1",
        }),
      })
    })
    it("surfaces an unpublished workflow as LineaApiError", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          { statusCode: 400, message: "Workflow has no published version" },
          400
        )
      )
      await expect(client().workflows.run("wf-1")).rejects.toMatchObject({
        status: 400,
        message: "Workflow has no published version",
      })
    })
  })
  describe("executions.wait", () => {
    function detail(status: Execution["status"]): ExecutionDetail {
      return {
        execution: fixtureExecution({ status }),
        steps: [],
        nodeConfigs: {},
        replayable: false,
        waitingNodes: [],
      }
    }
    it("polls until the execution finishes", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(detail("queued")))
        .mockResolvedValueOnce(jsonResponse(detail("paused")))
        .mockResolvedValueOnce(jsonResponse(detail("succeeded")))
      const result = await client().executions.wait("exec-1", {
        intervalMs: 1,
      })
      expect(result.execution.status).toBe("succeeded")
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })
    it("throws LineaTimeoutError when the deadline passes first", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(jsonResponse(detail("running")))
      )
      await expect(
        client().executions.wait("exec-1", { intervalMs: 5, timeoutMs: 12 })
      ).rejects.toBeInstanceOf(LineaTimeoutError)
    })
    it("waits out the timeout when the interval is longer", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(jsonResponse(detail("running")))
      )
      const started = Date.now()
      await expect(
        client().executions.wait("exec-1", {
          intervalMs: 60_000,
          timeoutMs: 30,
        })
      ).rejects.toBeInstanceOf(LineaTimeoutError)
      expect(Date.now() - started).toBeGreaterThanOrEqual(25)
    })
    it("times out while a read is still pending", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        () => new Promise<Response>(() => {})
      )
      await expect(
        client().executions.wait("exec-1", { timeoutMs: 20 })
      ).rejects.toMatchObject({ name: "LineaTimeoutError", status: undefined })
    })
  })
  describe("executions.get", () => {
    it("GETs /v1/workspace/executions/:id and returns the full detail", async () => {
      const detail: ExecutionDetail = {
        execution: fixtureExecution({ status: "paused" }),
        steps: [],
        nodeConfigs: {},
        replayable: true,
        waitingNodes: [
          { nodeId: "n1", type: "wait" },
          { nodeId: "n2", type: "agent" },
        ],
        pausedAtNode: { nodeId: "n1", type: "wait" },
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(detail))
      const result = await client().executions.get("exec-1")
      expect(result).toEqual(detail)
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(url).toBe("http://localhost:3000/v1/workspace/executions/exec-1")
    })
    it("throws LineaApiError with status 404 when not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Execution not found" }, 404)
      )
      await expect(client().executions.get("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })
  describe("executions.listForWorkflow", () => {
    it("GETs /v1/workflows/:id/executions and returns the array", async () => {
      const fixtures = [
        fixtureExecution({ id: "e1" }),
        fixtureExecution({ id: "e2" }),
      ]
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(fixtures))
      const result = await client().executions.listForWorkflow("wf-1")
      expect(result).toEqual(fixtures)
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(url).toBe("http://localhost:3000/v1/workflows/wf-1/executions")
    })
    it("throws LineaApiError with status 404 for an unknown workflow", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Workflow not found" }, 404)
      )
      await expect(
        client().executions.listForWorkflow("missing")
      ).rejects.toMatchObject({
        status: 404,
      })
    })
  })
  describe("executions.list", () => {
    it("builds the query string from status/trigger/cursor and returns the page", async () => {
      const page = {
        executions: [
          { ...fixtureExecution(), workflowName: "Demo", workflowSlug: "demo" },
        ],
        hasMore: false,
        total: 1,
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(page))
      const result = await client().executions.list({
        status: "succeeded",
        trigger: "webhook",
        cursor: "2026-09-05T00:00:00.000Z_exec-0",
      })
      expect(result).toEqual(page)
      const [url] = fetchSpy.mock.calls[0] as [string]
      const parsed = new URL(url)
      expect(parsed.searchParams.get("status")).toBe("succeeded")
      expect(parsed.searchParams.get("trigger")).toBe("webhook")
      expect(parsed.searchParams.get("cursor")).toBe(
        "2026-09-05T00:00:00.000Z_exec-0"
      )
    })
    it("round-trips a cursor built from the previous page's last row", async () => {
      const lastRow = {
        ...fixtureExecution({
          id: "exec-2",
          createdAt: "2026-09-05T01:00:00.000Z",
        }),
        workflowName: "Demo",
        workflowSlug: "demo",
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          jsonResponse({ executions: [lastRow], hasMore: true, total: 5 })
        )
        .mockResolvedValueOnce(
          jsonResponse({ executions: [], hasMore: false, total: 5 })
        )
      const first = await client().executions.list()
      const cursor = nextExecutionsCursor(first.executions[0])
      await client().executions.list({ cursor })
      const [secondUrl] = fetchSpy.mock.calls[1] as [string]
      const parsed = new URL(secondUrl)
      expect(parsed.searchParams.get("cursor")).toBe(
        "2026-09-05T01:00:00.000Z_exec-2"
      )
    })
    it("throws LineaApiError with status 400 for a malformed cursor", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(
          {
            statusCode: 400,
            message: [{ code: "custom", message: "Invalid cursor" }],
          },
          400
        )
      )
      await expect(
        client().executions.list({ cursor: "not-a-cursor" })
      ).rejects.toMatchObject({ status: 400 })
    })
  })
  describe("executions.countNew", () => {
    it("returns the bare number from the response body", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(7))
      const result = await client().executions.countNew({
        since: "2026-09-05T00:00:00.000Z_exec-0",
      })
      expect(result).toBe(7)
      expect(typeof result).toBe("number")
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(new URL(url).searchParams.get("since")).toBe(
        "2026-09-05T00:00:00.000Z_exec-0"
      )
    })
    it("throws LineaApiError with status 400 when since is missing", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 400, message: "since is required" }, 400)
      )
      // @ts-expect-error deliberately omitting the required param to exercise the error path
      await expect(client().executions.countNew({})).rejects.toMatchObject({
        status: 400,
      })
    })
  })
  describe("signals.list", () => {
    it("GETs /v1/signals with and without a workflowId filter", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse([])))
      await client().signals.list()
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        "http://localhost:3000/v1/signals"
      )
      await client().signals.list({ workflowId: "wf-1" })
      expect(fetchSpy.mock.calls[1]?.[0]).toBe(
        "http://localhost:3000/v1/signals?workflowId=wf-1"
      )
    })
    it("throws LineaApiError on a server error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 500, message: "Internal server error" }, 500)
      )
      await expect(client().signals.list()).rejects.toMatchObject({
        status: 500,
      })
    })
  })
  describe("signals.trend", () => {
    it("returns the trend point array", async () => {
      const trend = [{ day: "2026-09-01", count: 3 }]
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(trend))
      const result = await client().signals.trend()
      expect(result).toEqual(trend)
    })
  })
  describe("signals.get", () => {
    it("returns the full merged detail including dimensions and dimensionScope", async () => {
      const detail: SignalDetailResponse = {
        id: "sig-1",
        workspaceId: "ws-1",
        workflowId: "wf-1",
        nodeId: "n1",
        flagType: "refusal",
        signalKey: "refusal:wf-1:n1",
        resolvedAt: null,
        regressedAt: null,
        createdAt: "2026-09-05T00:00:00.000Z",
        status: "open",
        occurrenceCount: 6,
        firstFlaggedAt: "2026-09-05T00:00:00.000Z",
        lastFlaggedAt: "2026-09-05T01:00:00.000Z",
        flags: [],
        affectedExecutions: 6,
        trend: [{ day: "2026-09-05", count: 6 }],
        dimensionsApplicable: true,
        attributedRuns: 12,
        totalRuns: 12,
        dimensions: [
          {
            model: "openai/gpt-oss-20b",
            provider: "groq",
            occurrences: 6,
            totalRuns: 6,
            rate: 1,
            baselineOccurrences: 0,
            baselineRuns: 6,
            baselineRate: 0,
            lift: null,
            comparison: "no-baseline-occurrences",
            sampleStatus: "sufficient",
          },
        ],
        dimensionScope: { environment: "production", windowDays: 30 },
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(detail))
      const result = await client().signals.get("sig-1", {
        environment: "draft",
      })
      expect(result).toEqual(detail)
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(new URL(url).searchParams.get("environment")).toBe("draft")
    })
    it("throws LineaApiError with status 404 when not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Signal not found" }, 404)
      )
      await expect(client().signals.get("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })
  describe("signals.resolve", () => {
    it("POSTs to /v1/signals/:id/resolve with no body and returns the updated Signal", async () => {
      const signal = {
        id: "sig-1",
        workspaceId: "ws-1",
        workflowId: "wf-1",
        nodeId: "n1",
        flagType: "refusal" as const,
        signalKey: "refusal:wf-1:n1",
        resolvedAt: "2026-09-05T02:00:00.000Z",
        regressedAt: null,
        createdAt: "2026-09-05T00:00:00.000Z",
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(signal))
      const result = await client().signals.resolve("sig-1")
      expect(result).toEqual(signal)
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe("http://localhost:3000/v1/signals/sig-1/resolve")
      expect(init.method).toBe("POST")
      expect(init.body).toBeUndefined()
    })
    it("throws LineaApiError with status 404 when not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Signal not found" }, 404)
      )
      await expect(client().signals.resolve("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })
  it("throws LineaApiError, not a generic error, so callers can branch on .status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ statusCode: 401, message: "Invalid API key" }, 401)
    )
    await expect(client().signals.list()).rejects.toBeInstanceOf(LineaApiError)
  })
})

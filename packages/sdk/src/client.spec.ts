import { afterEach, describe, expect, it, vi } from "vitest"
import { LineaClient } from "./client.js"
import { LineaApiError } from "./http/errors.js"
import { nextExecutionsCursor } from "./types/index.js"
import type {
  Execution,
  ExecutionDetail,
  SignalDetailResponse,
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
  return new LineaClient({
    apiKey: "lin_test",
    baseUrl: "http://localhost:3000",
  })
}

describe("LineaClient", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("triggerWorkflow", () => {
    it("POSTs to /v1/triggers/:slug with the payload and returns the Execution", async () => {
      const fixture = fixtureExecution()
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(fixture))

      const result = await client().triggerWorkflow("my-slug", { foo: "bar" })

      expect(result).toEqual(fixture)
      expect(result.costMicros).toBe("1500")
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe("http://localhost:3000/v1/triggers/my-slug")
      expect(init.method).toBe("POST")
      expect(init.body).toBe(JSON.stringify({ foo: "bar" }))
    })

    it("throws LineaApiError with status 404 for an unknown slug", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Workflow not found" }, 404)
      )

      await expect(client().triggerWorkflow("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe("getExecution", () => {
    it("GETs /v1/executions/:id and returns the full detail", async () => {
      const detail: ExecutionDetail = {
        execution: fixtureExecution({ status: "paused" }),
        steps: [],
        nodeConfigs: {},
        replayable: true,
        pausedAtNode: { nodeId: "n1", type: "wait" },
      }
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(detail))

      const result = await client().getExecution("exec-1")

      expect(result).toEqual(detail)
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(url).toBe("http://localhost:3000/v1/executions/exec-1")
    })

    it("throws LineaApiError with status 404 when not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Execution not found" }, 404)
      )

      await expect(client().getExecution("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe("listWorkflowExecutions", () => {
    it("GETs /v1/workflows/:id/executions and returns the array", async () => {
      const fixtures = [
        fixtureExecution({ id: "e1" }),
        fixtureExecution({ id: "e2" }),
      ]
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(fixtures))

      const result = await client().listWorkflowExecutions("wf-1")

      expect(result).toEqual(fixtures)
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(url).toBe("http://localhost:3000/v1/workflows/wf-1/executions")
    })

    it("throws LineaApiError with status 404 for an unknown workflow", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Workflow not found" }, 404)
      )

      await expect(
        client().listWorkflowExecutions("missing")
      ).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe("listExecutions", () => {
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

      const result = await client().listExecutions({
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

      const first = await client().listExecutions()
      const cursor = nextExecutionsCursor(first.executions[0])
      await client().listExecutions({ cursor })

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
        client().listExecutions({ cursor: "not-a-cursor" })
      ).rejects.toMatchObject({ status: 400 })
    })
  })

  describe("countNewExecutions", () => {
    it("returns the bare number from the response body", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(7))

      const result = await client().countNewExecutions({
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
      await expect(client().countNewExecutions({})).rejects.toMatchObject({
        status: 400,
      })
    })
  })

  describe("listSignals", () => {
    it("GETs /v1/signals with and without a workflowId filter", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(() => Promise.resolve(jsonResponse([])))

      await client().listSignals()
      expect(fetchSpy.mock.calls[0]?.[0]).toBe(
        "http://localhost:3000/v1/signals"
      )

      await client().listSignals({ workflowId: "wf-1" })
      expect(fetchSpy.mock.calls[1]?.[0]).toBe(
        "http://localhost:3000/v1/signals?workflowId=wf-1"
      )
    })

    it("throws LineaApiError on a server error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 500, message: "Internal server error" }, 500)
      )

      await expect(client().listSignals()).rejects.toMatchObject({
        status: 500,
      })
    })
  })

  describe("getSignalsTrend", () => {
    it("returns the trend point array", async () => {
      const trend = [{ day: "2026-09-01", count: 3 }]
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(trend))

      const result = await client().getSignalsTrend()

      expect(result).toEqual(trend)
    })
  })

  describe("getSignal", () => {
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

      const result = await client().getSignal("sig-1", { environment: "draft" })

      expect(result).toEqual(detail)
      const [url] = fetchSpy.mock.calls[0] as [string]
      expect(new URL(url).searchParams.get("environment")).toBe("draft")
    })

    it("throws LineaApiError with status 404 when not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse({ statusCode: 404, message: "Signal not found" }, 404)
      )

      await expect(client().getSignal("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  describe("resolveSignal", () => {
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

      const result = await client().resolveSignal("sig-1")

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

      await expect(client().resolveSignal("missing")).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  it("throws LineaApiError, not a generic error, so callers can branch on .status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ statusCode: 401, message: "Invalid API key" }, 401)
    )

    await expect(client().listSignals()).rejects.toBeInstanceOf(LineaApiError)
  })
})

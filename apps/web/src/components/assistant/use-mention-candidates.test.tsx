// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useMentionCandidates } from "./use-mention-candidates"

const RUN_ID = "045f759c-1b2a-4c3d-8e4f-5a6b7c8d9e0f"
const summary = {
  id: RUN_ID,
  status: "failed",
  createdAt: "2026-11-23T00:00:00.000Z",
}

const fetchers = vi.hoisted(() => ({
  workspace: vi.fn(),
  workflow: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ slug: "acme" }),
}))
vi.mock("@/lib/executions-api", async () => {
  const { queryOptions } = await import("@tanstack/react-query")
  return {
    workspaceExecutionsQueryOptions: () =>
      queryOptions({ queryKey: ["ws-runs"], queryFn: fetchers.workspace }),
    executionsQueryOptions: (_slug: string, workflowId: string) =>
      queryOptions({
        queryKey: ["wf-runs", workflowId],
        queryFn: fetchers.workflow,
      }),
  }
})
vi.mock("@/lib/workflows-api", async () => {
  const { queryOptions } = await import("@tanstack/react-query")
  return {
    workflowsQueryOptions: () =>
      queryOptions({ queryKey: ["workflows"], queryFn: async () => [] }),
  }
})
vi.mock("@/lib/applications-api", async () => {
  const { queryOptions } = await import("@tanstack/react-query")
  return {
    applicationsQueryOptions: () =>
      queryOptions({ queryKey: ["applications"], queryFn: async () => [] }),
  }
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let latest: ReturnType<typeof useMentionCandidates>

function Probe({
  enabled,
  workflowId,
}: Readonly<{ enabled: boolean; workflowId?: string }>) {
  latest = useMentionCandidates(enabled, workflowId)
  return null
}

async function render(node: ReactNode) {
  const container = document.createElement("div")
  const root = createRoot(container)
  const client = new QueryClient()
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return root
}

afterEach(() => vi.clearAllMocks())

describe("useMentionCandidates", () => {
  it("fetches nothing while the picker is closed", async () => {
    const root = await render(<Probe enabled={false} />)
    expect(fetchers.workspace).not.toHaveBeenCalled()
    expect(fetchers.workflow).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it("offers the workspace's recent runs by workflow name outside a workflow chat", async () => {
    fetchers.workspace.mockResolvedValue({
      executions: [{ ...summary, workflowName: "Summarize tickets" }],
    })
    const root = await render(<Probe enabled />)
    expect(fetchers.workflow).not.toHaveBeenCalled()
    expect(latest.candidates).toEqual([
      expect.objectContaining({
        kind: "run",
        id: RUN_ID,
        label: "Summarize tickets",
      }),
    ])
    act(() => root.unmount())
  })

  it("fetches the workflow's own runs in a workflow chat, however busy the workspace is", async () => {
    fetchers.workflow.mockResolvedValue([summary])
    const root = await render(<Probe enabled workflowId="wf-1" />)
    expect(fetchers.workspace).not.toHaveBeenCalled()
    expect(latest.candidates).toEqual([
      expect.objectContaining({
        kind: "run",
        id: RUN_ID,
        label: "run 045f759c",
      }),
    ])
    act(() => root.unmount())
  })
})

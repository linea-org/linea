import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import { AppState, type AppStateStatus, Platform, Text } from "react-native"
import type { MonitoringApi } from "../src/api/monitoring-api"
import {
  createMonitoringApi,
  MonitoringApiProvider,
} from "../src/api/monitoring-api"
import type {
  ExecutionDetail,
  ExecutionPage,
  SignalSummary,
} from "../src/api/monitoring-types"
import {
  MobileAuthProvider,
  type MobileAuthClient,
} from "../src/auth/mobile-auth"
import { ExecutionDetailScreen } from "../src/features/executions/execution-detail-screen"
import { ExecutionsFeed } from "../src/features/executions/executions-feed"
import { SignalsFeed } from "../src/features/signals/signals-feed"
import { WorkspacesScreen } from "../src/features/workspaces/workspaces-screen"
import { ClearWorkspaceCacheContext } from "../src/query/monitoring-query"
import {
  MONITORING_MAX_POLLS,
  MONITORING_POLL_INTERVAL_MS,
  useMonitoringRefresh,
} from "../src/query/use-monitoring-refresh"

type FocusEffect = () => void | (() => void)

const mockUseFocusEffect = jest.fn<void, [FocusEffect]>()

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: FocusEffect) => {
    mockUseFocusEffect(callback)
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock("lucide-react-native", () => {
  function Icon() {
    return null
  }
  return {
    AlertCircleIcon: Icon,
    ArrowLeftIcon: Icon,
    ChevronRightIcon: Icon,
    InboxIcon: Icon,
    RadioTowerIcon: Icon,
  }
})

const executionPage: ExecutionPage = {
  executions: [
    {
      id: "execution-running",
      workflowId: "workflow-alpha",
      workflowName: "Alpha intake",
      workflowSlug: "alpha-intake",
      status: "running",
      trigger: "api",
      environment: "production",
      costMicros: "250000",
      costUnpriced: false,
      startedAt: "2026-09-18T10:00:00.000Z",
      completedAt: null,
      createdAt: "2026-09-18T10:00:00.000Z",
    },
    {
      id: "execution-failed",
      workflowId: "workflow-beta",
      workflowName: "Beta triage",
      workflowSlug: "beta-triage",
      status: "failed",
      trigger: "webhook",
      environment: "production",
      costMicros: "500000",
      costUnpriced: false,
      startedAt: "2026-09-18T09:00:00.000Z",
      completedAt: "2026-09-18T09:00:02.000Z",
      createdAt: "2026-09-18T09:00:00.000Z",
    },
    {
      id: "execution-succeeded",
      workflowId: "workflow-alpha",
      workflowName: "Alpha intake",
      workflowSlug: "alpha-intake",
      status: "succeeded",
      trigger: "manual",
      environment: "dev",
      costMicros: "100000",
      costUnpriced: false,
      startedAt: "2026-09-18T08:00:00.000Z",
      completedAt: "2026-09-18T08:00:01.000Z",
      createdAt: "2026-09-18T08:00:00.000Z",
    },
  ],
  hasMore: false,
  total: 3,
}

const executionDetail: ExecutionDetail = {
  execution: {
    id: "execution-failed",
    workflowId: "workflow-beta",
    status: "failed",
    trigger: "webhook",
    environment: "production",
    error: { message: "Provider timed out" },
    costMicros: "1500000",
    costUnpriced: false,
    startedAt: "2026-09-18T09:00:00.000Z",
    completedAt: "2026-09-18T09:00:02.000Z",
    createdAt: "2026-09-18T09:00:00.000Z",
  },
  steps: [
    {
      id: "step-1",
      name: "Classify request",
      nodeId: "classify",
      status: "failed",
      startedAt: "2026-09-18T09:00:00.000Z",
      endedAt: "2026-09-18T09:00:02.000Z",
      sequence: 1,
      costMicros: "500000",
    },
  ],
}

function createApi(overrides: Partial<MonitoringApi> = {}): MonitoringApi {
  return {
    listExecutions: jest.fn().mockResolvedValue(executionPage),
    getExecution: jest.fn().mockResolvedValue(executionDetail),
    listSignals: jest.fn().mockResolvedValue([]),
    getSignal: jest.fn(),
    ...overrides,
  }
}

function withMonitoring(screen: React.ReactNode, api = createApi()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <MonitoringApiProvider api={api}>{screen}</MonitoringApiProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

it("uses the native session cookie and follows every execution page", async () => {
  const firstPage: ExecutionPage = {
    executions: [executionPage.executions[0]],
    hasMore: true,
    total: 2,
  }
  const secondPage: ExecutionPage = {
    executions: [executionPage.executions[1]],
    hasMore: false,
    total: 2,
  }
  const fetchRequest = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(firstPage), { status: 200 })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(secondPage), { status: 200 })
    )
  const api = createMonitoringApi({
    baseUrl: "https://api.example.com",
    getCookie: () => "session=mobile",
  })
  const result = await api.listExecutions()
  expect(result.executions).toHaveLength(2)
  expect(fetchRequest).toHaveBeenNthCalledWith(
    1,
    "https://api.example.com/v1/executions",
    { credentials: "omit", headers: { cookie: "session=mobile" } }
  )
  expect(fetchRequest.mock.calls[1]?.[0]).toContain("cursor=")
  fetchRequest.mockRestore()
})

it("uses browser credentials without trying to set a Cookie header", async () => {
  const platform = jest.replaceProperty(Platform, "OS", "web")
  const fetchRequest = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("[]", { status: 200 }))
  const api = createMonitoringApi({
    baseUrl: "https://api.example.com",
    getCookie: () => "session=mobile",
  })
  await api.listSignals()
  expect(fetchRequest).toHaveBeenCalledWith(
    "https://api.example.com/v1/signals",
    { credentials: "include", headers: undefined }
  )
  fetchRequest.mockRestore()
  platform.restore()
})

it("filters the execution response by monitored status and workflow", async () => {
  const screen = await render(
    withMonitoring(<ExecutionsFeed workspaceId="workspace-1" />)
  )
  expect(
    await screen.findByLabelText("Open execution Alpha intake")
  ).toBeTruthy()
  expect(screen.getByLabelText("Open execution Beta triage")).toBeTruthy()
  expect(screen.queryByText("Succeeded")).toBeNull()
  await fireEvent.press(screen.getByLabelText("Filter: failed"))
  expect(screen.queryByLabelText("Open execution Alpha intake")).toBeNull()
  expect(screen.getByLabelText("Open execution Beta triage")).toBeTruthy()
  await fireEvent.press(screen.getByLabelText("Filter: All statuses"))
  await fireEvent.press(screen.getByLabelText("Filter: Alpha intake"))
  expect(screen.getByLabelText("Open execution Alpha intake")).toBeTruthy()
  expect(screen.queryByLabelText("Open execution Beta triage")).toBeNull()
})

it("renders loading, error, and empty execution states", async () => {
  const pending = new Promise<ExecutionPage>(() => undefined)
  const loading = await render(
    withMonitoring(
      <ExecutionsFeed workspaceId="workspace-loading" />,
      createApi({ listExecutions: () => pending })
    )
  )
  expect(loading.getByLabelText("Loading executions")).toBeTruthy()
  await loading.unmount()
  const error = await render(
    withMonitoring(
      <ExecutionsFeed workspaceId="workspace-error" />,
      createApi({
        listExecutions: () => Promise.reject(new Error("Network unavailable")),
      })
    )
  )
  expect(await error.findByText("Network unavailable")).toBeTruthy()
  await error.unmount()
  const empty = await render(
    withMonitoring(
      <ExecutionsFeed workspaceId="workspace-empty" />,
      createApi({
        listExecutions: () =>
          Promise.resolve({ executions: [], hasMore: false, total: 0 }),
      })
    )
  )
  expect(await empty.findByText("No active executions")).toBeTruthy()
})

it("renders execution status, cost, duration, and step details", async () => {
  const screen = await render(
    withMonitoring(
      <ExecutionDetailScreen
        executionId="execution-failed"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />
    )
  )
  expect(await screen.findByText("Provider timed out")).toBeTruthy()
  expect(screen.getByText("Classify request")).toBeTruthy()
  expect(screen.getByText("$1.50")).toBeTruthy()
  expect(screen.getByText("2.0s")).toBeTruthy()
  expect(screen.getByText("2.0s · $0.50")).toBeTruthy()
})

it("renders the read-only Signals feed and its empty state", async () => {
  const signals: SignalSummary[] = [
    {
      id: "signal-1",
      workspaceId: "workspace-1",
      workflowId: "workflow-alpha",
      nodeId: "classify",
      flagType: "retry_storm",
      signalKey: "workflow-alpha:classify:retry-storm",
      status: "open",
      occurrenceCount: 4,
      firstFlaggedAt: "2026-09-17T09:00:00.000Z",
      lastFlaggedAt: "2026-09-18T09:00:00.000Z",
    },
  ]
  const populated = await render(
    withMonitoring(
      <SignalsFeed workspaceId="workspace-1" />,
      createApi({ listSignals: () => Promise.resolve(signals) })
    )
  )
  expect(await populated.findByText("Retry Storm")).toBeTruthy()
  expect(populated.getByText(/4 occurrences/)).toBeTruthy()
  await populated.unmount()
  const empty = await render(
    withMonitoring(<SignalsFeed workspaceId="workspace-empty" />)
  )
  expect(await empty.findByText("No signals yet")).toBeTruthy()
})

it("refreshes on focus and foreground while polling only when active", async () => {
  jest.useFakeTimers()
  let stateListener: ((state: AppStateStatus) => void) | undefined
  const addEventListener = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      stateListener = listener
      return { remove: jest.fn() }
    })
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    value: "active",
  })
  const refresh = jest.fn()
  function Harness() {
    useMonitoringRefresh(refresh)
    return <Text>Harness</Text>
  }
  const harness = await render(<Harness />)
  const focused = mockUseFocusEffect.mock.calls[0]?.[0]
  expect(focused).toBeDefined()
  const cleanup = focused?.()
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => jest.advanceTimersByTime(MONITORING_POLL_INTERVAL_MS))
  expect(refresh).toHaveBeenCalledTimes(2)
  await act(async () => stateListener?.("background"))
  await act(async () =>
    jest.advanceTimersByTime(MONITORING_POLL_INTERVAL_MS * 2)
  )
  expect(refresh).toHaveBeenCalledTimes(2)
  await act(async () => stateListener?.("active"))
  expect(refresh).toHaveBeenCalledTimes(3)
  await act(async () =>
    jest.advanceTimersByTime(
      MONITORING_POLL_INTERVAL_MS * (MONITORING_MAX_POLLS + 2)
    )
  )
  expect(refresh).toHaveBeenCalledTimes(3 + MONITORING_MAX_POLLS)
  if (typeof cleanup === "function") cleanup()
  await harness.unmount()
  addEventListener.mockRestore()
  jest.useRealTimers()
})

it("clears cached monitoring data before activating another workspace", async () => {
  const clearWorkspaceCache = jest.fn()
  const setActiveWorkspace = jest
    .fn()
    .mockResolvedValue({ data: {}, error: null })
  const authClient: MobileAuthClient = {
    useSession: () => ({
      data: {
        user: { id: "user-1", name: "Rohit", email: "rohit@example.com" },
        session: { activeOrganizationId: "workspace-1" },
      },
      isPending: false,
    }),
    requestMagicLink: jest.fn(),
    verifyMagicLink: jest.fn(),
    listWorkspaces: jest.fn().mockResolvedValue({
      data: [
        { id: "workspace-1", name: "Support", slug: "support" },
        { id: "workspace-2", name: "Operations", slug: "operations" },
      ],
      error: null,
    }),
    createWorkspace: jest.fn(),
    setActiveWorkspace,
  }
  const screen = await render(
    <ClearWorkspaceCacheContext.Provider value={clearWorkspaceCache}>
      <MobileAuthProvider client={authClient}>
        <WorkspacesScreen />
      </MobileAuthProvider>
    </ClearWorkspaceCacheContext.Provider>
  )
  await fireEvent.press(await screen.findByText("Operations"))
  await waitFor(() =>
    expect(setActiveWorkspace).toHaveBeenCalledWith("workspace-2")
  )
  expect(clearWorkspaceCache).toHaveBeenCalledTimes(1)
  expect(clearWorkspaceCache.mock.invocationCallOrder[0]).toBeLessThan(
    setActiveWorkspace.mock.invocationCallOrder[0]
  )
})

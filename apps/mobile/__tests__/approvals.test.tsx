import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import * as Network from "expo-network"
import { AppState, type AppStateStatus, Pressable, Text } from "react-native"
import {
  ApprovalApiError,
  ApprovalApiProvider,
  type ApprovalApi,
} from "../src/api/approval-api"
import type { ApprovalRequest } from "../src/api/approval-types"
import { ApprovalDetailScreen } from "../src/features/approvals/approval-detail-screen"
import { ApprovalsFeed } from "../src/features/approvals/approvals-feed"
import {
  monitoringQueryClient,
  MonitoringQueryProvider,
  useClearWorkspaceCache,
} from "../src/query/monitoring-query"

type FocusEffect = () => void | (() => void)

const mockUseFocusEffect = jest.fn<void, [FocusEffect]>()

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: FocusEffect) => mockUseFocusEffect(callback),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock("expo-network", () => ({
  getNetworkStateAsync: jest.fn(),
  NetworkStateType: { NONE: "NONE", WIFI: "WIFI" },
}))

jest.mock("lucide-react-native", () => {
  function Icon() {
    return null
  }
  return { ArrowLeftIcon: Icon, ChevronRightIcon: Icon }
})

const pendingApproval: ApprovalRequest = {
  id: "approval-1",
  executionId: "execution-1",
  nodeId: "approval-node",
  audience: "workspace",
  status: "pending",
  display: {
    title: "Send customer refund?",
    description: "Refund the duplicate charge.",
    details: { Amount: "$49.00", Customer: "Taylor" },
  },
  approverEmails: ["operator@example.com"],
  timeoutAt: null,
  respondedBy: null,
  respondedAt: null,
  timedOut: false,
  createdAt: "2026-09-18T10:00:00.000Z",
}

function approval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return { ...pendingApproval, ...overrides }
}

function createApi(overrides: Partial<ApprovalApi> = {}): ApprovalApi {
  return {
    listApprovals: jest.fn().mockResolvedValue([pendingApproval]),
    getApproval: jest.fn().mockResolvedValue(pendingApproval),
    respondToApproval: jest.fn().mockResolvedValue(pendingApproval),
    ...overrides,
  }
}

function withApprovals(screen: React.ReactNode, api: ApprovalApi) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false },
    },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ApprovalApiProvider api={api}>{screen}</ApprovalApiProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
    type: Network.NetworkStateType.WIFI,
  })
})

it("shows only eligible workspace-audience requests", async () => {
  const api = createApi({
    listApprovals: jest.fn().mockResolvedValue([
      pendingApproval,
      approval({
        id: "external",
        audience: "external_subject",
        display: { title: "External request" },
      }),
      approval({
        id: "other-approver",
        approverEmails: ["someone-else@example.com"],
        display: { title: "Other approver request" },
      }),
    ]),
  })
  const screen = await render(
    withApprovals(
      <ApprovalsFeed
        userEmail="OPERATOR@example.com"
        workspaceId="workspace-1"
      />,
      api
    )
  )
  expect(await screen.findByText("Send customer refund?")).toBeTruthy()
  expect(screen.queryByText("External request")).toBeNull()
  expect(screen.queryByText("Other approver request")).toBeNull()
})

it("renders only the immutable safe display snapshot", async () => {
  const unsafeResponse = {
    ...pendingApproval,
    rawNodeInput: "private account token",
    mutableConfiguration: "unsafe workflow configuration",
  }
  const screen = await render(
    withApprovals(
      <ApprovalDetailScreen
        approvalId="approval-1"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />,
      createApi({ getApproval: jest.fn().mockResolvedValue(unsafeResponse) })
    )
  )
  expect(await screen.findByText("Send customer refund?")).toBeTruthy()
  expect(screen.getByText("Refund the duplicate charge.")).toBeTruthy()
  expect(screen.getByText("$49.00")).toBeTruthy()
  expect(screen.queryByText("private account token")).toBeNull()
  expect(screen.queryByText("unsafe workflow configuration")).toBeNull()
})

it.each([
  ["Approve", "approved"],
  ["Reject", "rejected"],
] as const)(
  "submits %s and reconciles authoritative state",
  async (label, status) => {
    const terminal = approval({ status })
    const getApproval = jest
      .fn()
      .mockResolvedValueOnce(pendingApproval)
      .mockResolvedValueOnce(terminal)
    const respondToApproval = jest.fn().mockResolvedValue(terminal)
    const screen = await render(
      withApprovals(
        <ApprovalDetailScreen
          approvalId="approval-1"
          goBack={jest.fn()}
          workspaceId="workspace-1"
        />,
        createApi({ getApproval, respondToApproval })
      )
    )
    await fireEvent.press(await screen.findByText(label))
    await waitFor(() =>
      expect(respondToApproval).toHaveBeenCalledWith("approval-1", status)
    )
    await waitFor(() => expect(getApproval).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(`Request ${status}.`)).toBeTruthy()
  }
)

it("refreshes approvals on focus and foreground", async () => {
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
  const listApprovals = jest.fn().mockResolvedValue([pendingApproval])
  await render(
    withApprovals(
      <ApprovalsFeed
        userEmail="operator@example.com"
        workspaceId="workspace-1"
      />,
      createApi({ listApprovals })
    )
  )
  await waitFor(() => expect(listApprovals).toHaveBeenCalledTimes(1))
  const focused = mockUseFocusEffect.mock.calls[0]?.[0]
  expect(focused).toBeDefined()
  const cleanup = focused?.()
  await waitFor(() => expect(listApprovals).toHaveBeenCalledTimes(2))
  await act(async () => stateListener?.("background"))
  await act(async () => stateListener?.("active"))
  await waitFor(() => expect(listApprovals).toHaveBeenCalledTimes(3))
  if (typeof cleanup === "function") cleanup()
  addEventListener.mockRestore()
})

it("rejects an offline decision without submitting or queueing it", async () => {
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({
    isConnected: false,
    isInternetReachable: false,
    type: Network.NetworkStateType.NONE,
  })
  const respondToApproval = jest.fn()
  const getApproval = jest.fn().mockResolvedValue(pendingApproval)
  const screen = await render(
    withApprovals(
      <ApprovalDetailScreen
        approvalId="approval-1"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />,
      createApi({ getApproval, respondToApproval })
    )
  )
  await fireEvent.press(await screen.findByText("Approve"))
  expect(await screen.findByText(/You are offline/)).toBeTruthy()
  expect(respondToApproval).not.toHaveBeenCalled()
  expect(getApproval).toHaveBeenCalledTimes(1)
})

it("confirms a decision after the response is lost", async () => {
  const getApproval = jest
    .fn()
    .mockResolvedValueOnce(pendingApproval)
    .mockResolvedValueOnce(approval({ status: "approved" }))
  const respondToApproval = jest
    .fn()
    .mockRejectedValue(new TypeError("Network request failed"))
  const screen = await render(
    withApprovals(
      <ApprovalDetailScreen
        approvalId="approval-1"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />,
      createApi({ getApproval, respondToApproval })
    )
  )
  await fireEvent.press(await screen.findByText("Approve"))
  expect(
    await screen.findByText(
      "The response was lost, but the approved decision was confirmed."
    )
  ).toBeTruthy()
  expect(respondToApproval).toHaveBeenCalledTimes(1)
  expect(getApproval).toHaveBeenCalledTimes(2)
})

it("surfaces an authoritative conflicting terminal decision", async () => {
  const getApproval = jest
    .fn()
    .mockResolvedValueOnce(pendingApproval)
    .mockResolvedValueOnce(approval({ status: "rejected" }))
  const respondToApproval = jest
    .fn()
    .mockRejectedValue(new ApprovalApiError("Already decided", 404))
  const screen = await render(
    withApprovals(
      <ApprovalDetailScreen
        approvalId="approval-1"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />,
      createApi({ getApproval, respondToApproval })
    )
  )
  await fireEvent.press(await screen.findByText("Approve"))
  expect(
    await screen.findByText(
      "Another approver rejected this request first. Your decision to approve was not applied."
    )
  ).toBeTruthy()
  expect(respondToApproval).toHaveBeenCalledTimes(1)
  expect(getApproval).toHaveBeenCalledTimes(2)
})

it("surfaces cancelled and timed-out terminal states", async () => {
  const cancelled = await render(
    withApprovals(
      <ApprovalDetailScreen
        approvalId="cancelled"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />,
      createApi({
        getApproval: jest
          .fn()
          .mockResolvedValue(
            approval({ id: "cancelled", status: "cancelled" })
          ),
      })
    )
  )
  expect(await cancelled.findByText("This request was cancelled.")).toBeTruthy()
  await cancelled.unmount()
  const timedOut = await render(
    withApprovals(
      <ApprovalDetailScreen
        approvalId="timed-out"
        goBack={jest.fn()}
        workspaceId="workspace-1"
      />,
      createApi({
        getApproval: jest
          .fn()
          .mockResolvedValue(
            approval({ id: "timed-out", status: "rejected", timedOut: true })
          ),
      })
    )
  )
  expect(
    await timedOut.findByText(
      "This request timed out and was automatically rejected."
    )
  ).toBeTruthy()
})

it("removes approval data before another workspace can use the cache", async () => {
  monitoringQueryClient.setQueryData(
    ["approvals", "workspace-1", "feed"],
    [pendingApproval]
  )
  function ClearCache() {
    const clear = useClearWorkspaceCache()
    return (
      <Pressable onPress={clear}>
        <Text>Clear workspace cache</Text>
      </Pressable>
    )
  }
  const screen = await render(
    <MonitoringQueryProvider>
      <ClearCache />
    </MonitoringQueryProvider>
  )
  await fireEvent.press(screen.getByText("Clear workspace cache"))
  expect(
    monitoringQueryClient.getQueryData(["approvals", "workspace-1", "feed"])
  ).toBeUndefined()
})

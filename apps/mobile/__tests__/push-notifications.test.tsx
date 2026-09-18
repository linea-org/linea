import { act, render, waitFor } from "@testing-library/react-native"
import {
  MobileAuthProvider,
  type MobileAuthClient,
} from "../src/auth/mobile-auth"
import { NotificationNavigation } from "../src/notifications/notification-navigation"
import { parseNotificationTarget } from "../src/notifications/notification-target"
import { ClearWorkspaceCacheContext } from "../src/query/monitoring-query"

type TestResponse = ReturnType<typeof response>
type TestResponseListener = (response: TestResponse) => void

const mockReplace = jest.fn<void, [unknown]>()
const mockLastResponse = jest.fn<Promise<TestResponse | null>, []>()
const mockAddResponseListener = jest.fn<
  { remove: () => void },
  [TestResponseListener]
>()
const mockClearLastResponse = jest.fn<Promise<void>, []>()

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: (target: unknown) => mockReplace(target) }),
}))

jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: (listener: TestResponseListener) =>
    mockAddResponseListener(listener),
  clearLastNotificationResponseAsync: () => mockClearLastResponse(),
  getLastNotificationResponseAsync: () => mockLastResponse(),
}))

const setActiveWorkspace = jest.fn()
const authClient: MobileAuthClient = {
  useSession: () => ({
    data: {
      user: { id: "user-1", name: "Rohit", email: "rohit@example.com" },
      session: { activeOrganizationId: "workspace-current" },
    },
    isPending: false,
  }),
  requestMagicLink: jest.fn(),
  verifyMagicLink: jest.fn(),
  listWorkspaces: jest.fn(),
  createWorkspace: jest.fn(),
  setActiveWorkspace,
}

function response(data: Record<string, string>) {
  return { notification: { request: { content: { data } } } }
}

function renderNavigation(clearWorkspaceCache = jest.fn()) {
  return render(
    <ClearWorkspaceCacheContext.Provider value={clearWorkspaceCache}>
      <MobileAuthProvider client={authClient}>
        <NotificationNavigation />
      </MobileAuthProvider>
    </ClearWorkspaceCacheContext.Provider>
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockLastResponse.mockResolvedValue(null)
  mockClearLastResponse.mockResolvedValue(undefined)
  mockAddResponseListener.mockReturnValue({ remove: jest.fn() })
  setActiveWorkspace.mockResolvedValue({ data: {}, error: null })
})

it("opens a cold notification after selecting its authenticated workspace", async () => {
  const clearWorkspaceCache = jest.fn()
  mockLastResponse.mockResolvedValue(
    response({
      screen: "approval",
      workspaceId: "workspace-target",
      approvalId: "approval-1",
    })
  )
  await act(async () => {
    await renderNavigation(clearWorkspaceCache)
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() => {
    expect(setActiveWorkspace).toHaveBeenCalledWith("workspace-target")
    expect(clearWorkspaceCache).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/approvals/[approvalId]",
      params: { approvalId: "approval-1" },
    })
    expect(mockClearLastResponse).toHaveBeenCalledTimes(1)
  })
})

it("opens a warm notification without switching the current workspace", async () => {
  await renderNavigation()
  await waitFor(() => expect(mockAddResponseListener).toHaveBeenCalledTimes(1))
  const listener = mockAddResponseListener.mock.calls[0]?.[0]
  if (!listener) throw new Error("Notification listener was not registered")
  await act(async () => {
    listener(
      response({
        screen: "execution",
        workspaceId: "workspace-current",
        executionId: "execution-1",
      })
    )
  })
  await waitFor(() => {
    expect(setActiveWorkspace).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/executions/[executionId]",
      params: { executionId: "execution-1" },
    })
  })
})

it("parses only supported safe deep-link fields", () => {
  expect(
    parseNotificationTarget({
      screen: "signal",
      workspaceId: "workspace-1",
      signalId: "signal-1",
      secret: "discarded",
    })
  ).toEqual({
    screen: "signal",
    workspaceId: "workspace-1",
    signalId: "signal-1",
  })
  expect(
    parseNotificationTarget({ screen: "workflow", token: "secret" })
  ).toBeUndefined()
})

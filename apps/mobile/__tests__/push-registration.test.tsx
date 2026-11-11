import { act, render, waitFor } from "@testing-library/react-native"
import {
  MobileAuthProvider,
  type MobileAuthClient,
} from "../src/auth/mobile-auth"
import { PushRegistration } from "../src/notifications/push-registration"

const mockRegister = jest.fn<Promise<void>, [unknown]>()
const mockToken = jest.fn<Promise<{ data: string }>, []>()
const mockCookie = jest.fn<string, []>()
jest.mock("../src/notifications/push-device-api", () => ({
  registerPushDevice: (input: unknown) => mockRegister(input),
}))
jest.mock("../src/auth/better-auth-client", () => ({
  getMobileSessionCookie: () => mockCookie(),
}))
jest.mock("expo-device", () => ({ isDevice: true }))
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: async () => ({ status: "granted" }),
  PermissionStatus: { GRANTED: "granted" },
  getExpoPushTokenAsync: () => mockToken(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}))
let sessionId = "session-a"
let userId = "user-a"
const auth: MobileAuthClient = {
  useSession: () => ({
    data: {
      user: { id: userId, name: "A", email: "a@test.dev" },
      session: { id: sessionId },
    },
    isPending: false,
  }),
  signOut: jest.fn(),
  requestMagicLink: jest.fn(),
  verifyMagicLink: jest.fn(),
  listWorkspaces: jest.fn(),
  createWorkspace: jest.fn(),
  setActiveWorkspace: jest.fn(),
}
const view = () => (
  <MobileAuthProvider client={auth}>
    <PushRegistration />
  </MobileAuthProvider>
)

beforeEach(() => {
  jest.clearAllMocks()
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID = "test-project"
  process.env.EXPO_PUBLIC_API_URL = "https://api.test"
  sessionId = "session-a"
  userId = "user-a"
  mockCookie.mockReturnValue("session=a")
  mockToken.mockResolvedValue({ data: "ExponentPushToken[device]" })
  mockRegister.mockResolvedValue(undefined)
})

it("registers without a workspace and refreshes when the user or session changes", async () => {
  const screen = await render(view())
  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1))
  sessionId = "session-b"
  await screen.rerender(view())
  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2))
  userId = "user-b"
  await screen.rerender(view())
  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(3))
})

it("does not register an old effect after the session changes during token retrieval", async () => {
  let finishToken: ((value: { data: string }) => void) | undefined
  mockToken.mockReturnValueOnce(
    new Promise((resolve) => {
      finishToken = resolve
    })
  )
  const screen = await render(view())
  await waitFor(() => expect(mockToken).toHaveBeenCalledTimes(1))
  sessionId = "session-b"
  mockCookie.mockReturnValue("session=b")
  await screen.rerender(view())
  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1))
  await act(async () => {
    if (!finishToken) throw new Error("Token resolver missing")
    finishToken({ data: "ExponentPushToken[old]" })
  })
  expect(mockRegister).toHaveBeenCalledTimes(1)
  expect(mockRegister).toHaveBeenCalledWith(
    expect.objectContaining({ cookie: "session=b" })
  )
})

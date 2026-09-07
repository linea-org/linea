import { fireEvent, render, waitFor } from "@testing-library/react-native"
import {
  MobileAuthProvider,
  type MobileAuthClient,
} from "../src/auth/mobile-auth"
import { MagicLinkScreen } from "../src/features/auth/magic-link-screen"
import { SignInScreen } from "../src/features/auth/sign-in-screen"
import { WorkspacesScreen } from "../src/features/workspaces/workspaces-screen"

const requestMagicLink = jest.fn()
const verifyMagicLink = jest.fn()
const listWorkspaces = jest.fn()
const setActiveWorkspace = jest.fn()
const onVerified = jest.fn()
const onCreateWorkspace = jest.fn()

const authClient: MobileAuthClient = {
  useSession: () => ({
    data: {
      user: { id: "user-1", name: "Rohit", email: "rohit@example.com" },
      session: { activeOrganizationId: "workspace-1" },
    },
    isPending: false,
  }),
  requestMagicLink,
  verifyMagicLink,
  listWorkspaces,
  setActiveWorkspace,
}

function withAuth(screen: React.ReactNode) {
  return <MobileAuthProvider client={authClient}>{screen}</MobileAuthProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  requestMagicLink.mockResolvedValue({ data: {}, error: null })
  verifyMagicLink.mockResolvedValue({ data: {}, error: null })
  listWorkspaces.mockResolvedValue({
    data: [
      { id: "workspace-1", name: "Support", slug: "support" },
      { id: "workspace-2", name: "Operations", slug: "operations" },
    ],
    error: null,
  })
  setActiveWorkspace.mockResolvedValue({ data: {}, error: null })
})

it("requests a magic link that returns to the native app", async () => {
  const screen = await render(withAuth(<SignInScreen />))
  await fireEvent.changeText(
    screen.getByPlaceholderText("you@company.com"),
    "rohit@example.com"
  )
  await fireEvent.press(screen.getByText("Email sign-in link"))
  await waitFor(() => {
    expect(requestMagicLink).toHaveBeenCalledWith("rohit@example.com")
  })
  expect(screen.getByText("Check your email")).toBeTruthy()
})

it("verifies a token received by deep link and enters the app", async () => {
  await render(
    withAuth(<MagicLinkScreen onVerified={onVerified} token="magic-token" />)
  )
  await waitFor(() => {
    expect(verifyMagicLink).toHaveBeenCalledWith("magic-token")
    expect(onVerified).toHaveBeenCalledTimes(1)
  })
})

it("shows every membership and switches the active workspace", async () => {
  const screen = await render(
    withAuth(<WorkspacesScreen onCreateWorkspace={onCreateWorkspace} />)
  )
  expect(await screen.findByText("Support")).toBeTruthy()
  expect(screen.getByText("Operations")).toBeTruthy()
  await fireEvent.press(screen.getByText("Operations"))
  await waitFor(() => {
    expect(setActiveWorkspace).toHaveBeenCalledWith("workspace-2")
    expect(screen.getByText("Current workspace: Operations")).toBeTruthy()
  })
})

it("opens workspace onboarding when the operator has no memberships", async () => {
  listWorkspaces.mockResolvedValueOnce({ data: [], error: null })
  const screen = await render(
    withAuth(<WorkspacesScreen onCreateWorkspace={onCreateWorkspace} />)
  )
  expect(
    await screen.findByText("You do not belong to a workspace yet.")
  ).toBeTruthy()
  await fireEvent.press(screen.getByText("Create workspace"))
  expect(onCreateWorkspace).toHaveBeenCalledTimes(1)
})

it("retries workspace loading after a transient failure", async () => {
  listWorkspaces.mockResolvedValueOnce({
    data: null,
    error: new Error("Network unavailable"),
  })
  const screen = await render(
    withAuth(<WorkspacesScreen onCreateWorkspace={onCreateWorkspace} />)
  )
  expect(await screen.findByText("Network unavailable")).toBeTruthy()
  await fireEvent.press(screen.getByText("Try again"))
  expect(await screen.findByText("Support")).toBeTruthy()
  expect(listWorkspaces).toHaveBeenCalledTimes(2)
})

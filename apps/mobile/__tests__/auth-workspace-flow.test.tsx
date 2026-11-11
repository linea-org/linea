import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import {
  MobileAuthProvider,
  type MobileAuthClient,
} from "../src/auth/mobile-auth"
import { MagicLinkScreen } from "../src/features/auth/magic-link-screen"
import { SignInScreen } from "../src/features/auth/sign-in-screen"
import { WorkspacesScreen } from "../src/features/workspaces/workspaces-screen"

const mockReplace = jest.fn()

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const signOut = jest.fn()
const requestMagicLink = jest.fn()
const verifyMagicLink = jest.fn()
const listWorkspaces = jest.fn()
const createWorkspace = jest.fn()
const setActiveWorkspace = jest.fn()
const onVerified = jest.fn()

const authClient: MobileAuthClient = {
  useSession: () => ({
    data: {
      user: { id: "user-1", name: "Rohit", email: "rohit@example.com" },
      session: { id: "session-1", activeOrganizationId: "workspace-1" },
    },
    isPending: false,
  }),
  signOut,
  requestMagicLink,
  verifyMagicLink,
  listWorkspaces,
  createWorkspace,
  setActiveWorkspace,
}

function withAuth(screen: React.ReactNode) {
  return <MobileAuthProvider client={authClient}>{screen}</MobileAuthProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
  signOut.mockResolvedValue({ data: {}, error: null })
  requestMagicLink.mockResolvedValue({ data: {}, error: null })
  verifyMagicLink.mockResolvedValue({ data: {}, error: null })
  listWorkspaces.mockResolvedValue({
    data: [
      { id: "workspace-1", name: "Support", slug: "support" },
      { id: "workspace-2", name: "Operations", slug: "operations" },
    ],
    error: null,
  })
  createWorkspace.mockResolvedValue({
    data: {
      id: "workspace-3",
      name: "Customer Success",
      slug: "customer-success",
    },
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

it("requires confirmation before verifying a deep-link token and replacing a session", async () => {
  const screen = await render(
    withAuth(<MagicLinkScreen onVerified={onVerified} token="magic-token" />)
  )
  expect(verifyMagicLink).not.toHaveBeenCalled()
  expect(screen.getByText("Switch account?")).toBeTruthy()
  expect(screen.getByText(/rohit@example.com/)).toBeTruthy()
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  await waitFor(() => {
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(verifyMagicLink).toHaveBeenCalledWith("magic-token")
    expect(onVerified).toHaveBeenCalledTimes(1)
  })
})

it("shows every membership and switches the active workspace", async () => {
  const screen = await render(withAuth(<WorkspacesScreen />))
  expect(await screen.findByText("Support")).toBeTruthy()
  expect(screen.getByText("Operations")).toBeTruthy()
  await fireEvent.press(screen.getByText("Operations"))
  await waitFor(() => {
    expect(setActiveWorkspace).toHaveBeenCalledWith("workspace-2")
    expect(screen.getByText("Current workspace: Operations")).toBeTruthy()
    expect(mockReplace).toHaveBeenCalledWith("/monitor")
  })
})

it("creates and activates a workspace with the mobile session", async () => {
  listWorkspaces.mockResolvedValueOnce({ data: [], error: null })
  const screen = await render(withAuth(<WorkspacesScreen />))
  expect(
    await screen.findByText("You do not belong to a workspace yet.")
  ).toBeTruthy()
  await fireEvent.changeText(
    screen.getByLabelText("Workspace name"),
    "Customer Success"
  )
  await fireEvent.changeText(
    screen.getByLabelText("Workspace slug"),
    "customer-success"
  )
  await fireEvent.press(screen.getByText("Create workspace"))
  await waitFor(() => {
    expect(createWorkspace).toHaveBeenCalledWith({
      name: "Customer Success",
      slug: "customer-success",
    })
    expect(setActiveWorkspace).toHaveBeenCalledWith("workspace-3")
  })
  expect(
    await screen.findByText("Current workspace: Customer Success")
  ).toBeTruthy()
})

it("retries workspace loading after a transient failure", async () => {
  listWorkspaces.mockResolvedValueOnce({
    data: null,
    error: new Error("Network unavailable"),
  })
  const screen = await render(withAuth(<WorkspacesScreen />))
  expect(await screen.findByText("Network unavailable")).toBeTruthy()
  await fireEvent.press(screen.getByText("Try again"))
  expect(await screen.findByText("Support")).toBeTruthy()
  expect(listWorkspaces).toHaveBeenCalledTimes(2)
})

it("does not consume a missing token", async () => {
  const screen = await render(
    withAuth(<MagicLinkScreen onVerified={onVerified} token={undefined} />)
  )
  expect(
    screen.getByText("This sign-in link is missing its token.")
  ).toBeTruthy()
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  expect(verifyMagicLink).not.toHaveBeenCalled()
})

it("surfaces verification failures after confirmation", async () => {
  verifyMagicLink.mockRejectedValueOnce(new Error("Network unavailable"))
  const screen = await render(
    withAuth(<MagicLinkScreen onVerified={onVerified} token="magic-token" />)
  )
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  expect(await screen.findByRole("alert")).toBeTruthy()
  expect(onVerified).not.toHaveBeenCalled()
})

it("waits for the current session to load before allowing confirmation", async () => {
  let isPending = true
  const loadingClient = {
    ...authClient,
    useSession: () => ({ ...authClient.useSession(), isPending }),
  }
  const view = () => (
    <MobileAuthProvider client={loadingClient}>
      <MagicLinkScreen onVerified={onVerified} token="magic-token" />
    </MobileAuthProvider>
  )
  const screen = await render(view())
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  expect(verifyMagicLink).not.toHaveBeenCalled()
  isPending = false
  await screen.rerender(view())
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  await waitFor(() => expect(verifyMagicLink).toHaveBeenCalledTimes(1))
})

it("ignores a verification that finishes after the screen unmounts", async () => {
  let finishVerification = () => {}
  verifyMagicLink.mockReturnValueOnce(
    new Promise((resolve) => {
      finishVerification = () => resolve({ data: {}, error: null })
    })
  )
  const screen = await render(
    withAuth(<MagicLinkScreen onVerified={onVerified} token="magic-token" />)
  )
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  await screen.unmount()
  await act(async () => {
    finishVerification()
  })
  expect(onVerified).not.toHaveBeenCalled()
})

it("signs out through the backend even without a workspace", async () => {
  listWorkspaces.mockResolvedValue({ data: [], error: null })
  const screen = await render(withAuth(<WorkspacesScreen />))
  await fireEvent.press(screen.getByText("Sign out"))
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
})

it("keeps sign-out failures visible for retry", async () => {
  signOut.mockResolvedValueOnce({
    data: null,
    error: new Error("Network unavailable"),
  })
  const screen = await render(withAuth(<WorkspacesScreen />))
  await fireEvent.press(screen.getByText("Sign out"))
  expect(await screen.findByText("Network unavailable")).toBeTruthy()
  await fireEvent.press(screen.getByText("Sign out"))
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2))
})

it("does not replace an account if backend sign-out fails", async () => {
  signOut.mockResolvedValueOnce({
    data: null,
    error: new Error("Could not revoke session"),
  })
  const screen = await render(
    withAuth(<MagicLinkScreen onVerified={onVerified} token="magic-token" />)
  )
  await fireEvent.press(screen.getByText("Use this sign-in link"))
  expect(await screen.findByText("Could not revoke session")).toBeTruthy()
  expect(verifyMagicLink).not.toHaveBeenCalled()
})

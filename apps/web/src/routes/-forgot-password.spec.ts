import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { beforeEach, expect, it, vi } from "vitest"
import type { SessionData } from "../lib/auth-client"
import { fetchSessionFn, listOrganizationsFn } from "../lib/auth-session"
import { Route } from "./forgot-password"

vi.mock("../lib/auth-session", () => ({
  fetchSessionFn: vi.fn(),
  listOrganizationsFn: vi.fn(),
  setActiveOrganizationFn: vi.fn(),
}))
vi.mock("../components/auth", () => ({ AuthShell: () => null }))

const signedInSession = {
  user: {
    id: "user",
    email: "owner@example.test",
    name: "Owner",
    emailVerified: true,
  },
  session: {
    id: "session",
    userId: "user",
    token: "session-token",
    expiresAt: new Date("2027-01-01"),
    createdAt: new Date("2026-11-11"),
    updatedAt: new Date("2026-11-11"),
    activeOrganizationId: "workspace",
  },
} satisfies SessionData

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listOrganizationsFn).mockResolvedValue([
    { id: "workspace", name: "Workspace", slug: "workspace" },
  ])
})

it.each([
  { name: "signed-out", session: null },
  { name: "signed-in", session: signedInSession },
])("lets $name users reach password recovery", async ({ session }) => {
  vi.mocked(fetchSessionFn).mockResolvedValue(session)
  const root = createRootRoute()
  const recovery = createRoute({
    ...Route.options,
    getParentRoute: () => root,
    path: "/forgot-password",
  })
  const router = createRouter({
    routeTree: root.addChildren([recovery]),
    history: createMemoryHistory({ initialEntries: ["/forgot-password"] }),
  })
  await router.load()
  expect(router.state.location.pathname).toBe("/forgot-password")
  expect(
    router.state.matches.some(
      (match) =>
        match.fullPath === "/forgot-password" && match.status === "success"
    )
  ).toBe(true)
})

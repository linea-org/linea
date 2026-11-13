import { describe, expect, it } from "vitest"
import { isWorkspaceAdmin } from "./workspace-role"

const members = [
  { userId: "owner-id", role: "owner" },
  { userId: "admin-id", role: "admin" },
  { userId: "member-id", role: "member" },
]

describe("isWorkspaceAdmin", () => {
  it("accepts admins and owners", () => {
    expect(isWorkspaceAdmin(members, "owner-id")).toBe(true)
    expect(isWorkspaceAdmin(members, "admin-id")).toBe(true)
  })
  it("refuses members, strangers, and a session that has not loaded", () => {
    expect(isWorkspaceAdmin(members, "member-id")).toBe(false)
    expect(isWorkspaceAdmin(members, "someone-else")).toBe(false)
    expect(isWorkspaceAdmin(members, undefined)).toBe(false)
    expect(isWorkspaceAdmin([], "admin-id")).toBe(false)
  })
})
